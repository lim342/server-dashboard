// 聚合逻辑:并行发出全部即时查询,拼装成前端可直接渲染的快照结构

import {
  instantQuery,
  rangeQuery,
  toNum,
  firstValue,
  PROM_URL,
  type PromSample,
  type PromSeries,
} from './prometheus.js'
import {
  INSTANT_QUERIES,
  TREND_QUERIES,
  TREND_RANGE_SEC,
  TREND_STEP_SEC,
  THRESHOLDS,
} from './queries.js'
import type {
  AlertInfo,
  ClusterSummary,
  DiskUsage,
  GpuSnapshot,
  HostSnapshot,
  OverviewResponse,
  TrendSeries,
} from './types.js'

function indexByHostname(samples: PromSample[]): Map<string, PromSample[]> {
  const m = new Map<string, PromSample[]>()
  for (const s of samples) {
    const h = s.metric.hostname
    if (!h) continue
    const arr = m.get(h)
    if (arr) arr.push(s)
    else m.set(h, [s])
  }
  return m
}

function pick(map: Map<string, PromSample[]>, hostname: string): PromSample[] {
  return map.get(hostname) ?? []
}

interface GpuPartial {
  index: string
  uuid: string
  device: string
  model: string
  driver: string
  util: number | null
  memUtil: number | null
  fbUsed: number | null
  fbFree: number | null
  tempC: number | null
  memTempC: number | null
  powerW: number | null
  smClockMHz: number | null
  memClockMHz: number | null
}

function mergeGpuMetric(
  acc: Map<string, Map<string, GpuPartial>>,
  samples: PromSample[],
  set: (g: GpuPartial, v: number | null) => void,
) {
  for (const s of samples) {
    const h = s.metric.hostname
    const idx = s.metric.gpu ?? '?'
    if (!h) continue
    let perHost = acc.get(h)
    if (!perHost) {
      perHost = new Map()
      acc.set(h, perHost)
    }
    let g = perHost.get(idx)
    if (!g) {
      g = {
        index: idx,
        uuid: s.metric.UUID ?? '',
        device: s.metric.device ?? '',
        model: s.metric.modelName ?? '',
        driver: s.metric.DCGM_FI_DRIVER_VERSION ?? '',
        util: null,
        memUtil: null,
        fbUsed: null,
        fbFree: null,
        tempC: null,
        memTempC: null,
        powerW: null,
        smClockMHz: null,
        memClockMHz: null,
      }
      perHost.set(idx, g)
    }
    set(g, toNum(s.value[1]))
  }
}

function avgOf(nums: (number | null)[]): number | null {
  const valid = nums.filter((n): n is number => n !== null)
  if (!valid.length) return null
  return valid.reduce((a, b) => a + b, 0) / valid.length
}

function sumOf(nums: (number | null)[]): number | null {
  const valid = nums.filter((n): n is number => n !== null)
  if (!valid.length) return null
  return valid.reduce((a, b) => a + b, 0)
}

function maxOf(nums: (number | null)[]): number | null {
  const valid = nums.filter((n): n is number => n !== null)
  if (!valid.length) return null
  return Math.max(...valid)
}

function clampPercent(v: number | null): number | null {
  if (v === null) return null
  return Math.min(100, Math.max(0, v))
}

/** 掉线告警里的"失联多久",输出格式与前端 formatUptime 一致:如 "2 天 3 小时" / "3 小时 5 分" */
function formatSince(ms: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ms) / 1000))
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d} 天 ${h} 小时`
  if (h > 0) return `${h} 小时 ${m} 分`
  return `${m} 分`
}

// 每张卡(host/index)最后一次观察到在线的时间,跨请求记忆:
// 掉线占位卡用它展示"失联多久";服务重启后丢失,置空即可
const lastOnlineAt = new Map<string, number>()

export function seriesOf(samples: PromSeries[]): { ts: number[]; values: (number | null)[] } {
  if (!samples.length) return { ts: [], values: [] }
  const s = samples[0]
  return {
    ts: s.values.map((v) => v[0] * 1000),
    values: s.values.map((v) => toNum(v[1])),
  }
}

export async function collectOverview(): Promise<OverviewResponse> {
  const Q = INSTANT_QUERIES
  const [
    upNode,
    upDcgm,
    cpuPercent,
    cores,
    load1,
    load5,
    memTotal,
    memAvailable,
    diskPercent,
    uptime,
    uname,
    gpuUtil,
    gpuSeenSamples,
    gpuMemUtil,
    gpuFbUsed,
    gpuFbFree,
    gpuTemp,
    gpuMemTemp,
    gpuPower,
    gpuSmClock,
    gpuMemClock,
  ] = await Promise.all([
    instantQuery(Q.upNode),
    instantQuery(Q.upDcgm),
    instantQuery(Q.cpuPercent),
    instantQuery(Q.cores),
    instantQuery(Q.load1),
    instantQuery(Q.load5),
    instantQuery(Q.memTotal),
    instantQuery(Q.memAvailable),
    instantQuery(Q.diskPercent),
    instantQuery(Q.uptime),
    instantQuery(Q.uname),
    instantQuery(Q.gpuUtil),
    // 掉卡检测查询失败时退化为"不检测掉卡",不影响其余指标
    instantQuery(Q.gpuSeen).catch(() => [] as PromSample[]),
    instantQuery(Q.gpuMemUtil),
    instantQuery(Q.gpuFbUsed),
    instantQuery(Q.gpuFbFree),
    instantQuery(Q.gpuTemp),
    instantQuery(Q.gpuMemTemp),
    instantQuery(Q.gpuPower),
    instantQuery(Q.gpuSmClock),
    instantQuery(Q.gpuMemClock),
  ])

  const mUpNode = indexByHostname(upNode)
  const mUpDcgm = indexByHostname(upDcgm)
  const mCpu = indexByHostname(cpuPercent)
  const mCores = indexByHostname(cores)
  const mLoad1 = indexByHostname(load1)
  const mLoad5 = indexByHostname(load5)
  const mMemTotal = indexByHostname(memTotal)
  const mMemAvail = indexByHostname(memAvailable)
  const mDisk = indexByHostname(diskPercent)
  const mUptime = indexByHostname(uptime)
  const mUname = indexByHostname(uname)

  const gpuAcc = new Map<string, Map<string, GpuPartial>>()
  mergeGpuMetric(gpuAcc, gpuUtil, (g, v) => (g.util = v))
  mergeGpuMetric(gpuAcc, gpuMemUtil, (g, v) => (g.memUtil = v))
  mergeGpuMetric(gpuAcc, gpuFbUsed, (g, v) => (g.fbUsed = v))
  mergeGpuMetric(gpuAcc, gpuFbFree, (g, v) => (g.fbFree = v))
  mergeGpuMetric(gpuAcc, gpuTemp, (g, v) => (g.tempC = v))
  mergeGpuMetric(gpuAcc, gpuMemTemp, (g, v) => (g.memTempC = v === 0 ? null : v)) // 0 表示该卡不支持显存温度
  mergeGpuMetric(gpuAcc, gpuPower, (g, v) => (g.powerW = v))
  mergeGpuMetric(gpuAcc, gpuSmClock, (g, v) => (g.smClockMHz = v))
  mergeGpuMetric(gpuAcc, gpuMemClock, (g, v) => (g.memClockMHz = v))

  // 掉卡检测窗口内上报过真实样本的卡(hostname -> index -> 标签),
  // 当前即时查询里没有的即视为掉线,用占位卡补回列表,避免"4 张卡掉 1 张只显示 3 张"。
  // 不用 timestamp(last_over_time(...)) 取最后上报时间:实测所用 Prometheus(3.x)会把
  // stale marker 当最后一个样本返回,时间恒为当前时刻,区分不出真实掉线。
  const gpuSeen = new Map<string, Map<string, Record<string, string>>>()
  for (const s of gpuSeenSamples) {
    const h = s.metric.hostname
    const idx = s.metric.gpu
    if (!h || idx === undefined || toNum(s.value[1]) === null) continue
    let perHost = gpuSeen.get(h)
    if (!perHost) {
      perHost = new Map()
      gpuSeen.set(h, perHost)
    }
    if (!perHost.has(idx)) perHost.set(idx, s.metric)
  }

  const hosts: HostSnapshot[] = []
  for (const [hostname, nodeSamples] of mUpNode) {
    const nodeUp = firstValue(nodeSamples) === 1
    const dcgmUp = firstValue(pick(mUpDcgm, hostname)) === 1
    const ip = nodeSamples[0]?.metric.instance?.split(':')[0] ?? null

    const unameSample = pick(mUname, hostname)[0]
    const os =
      unameSample && unameSample.metric.nodename
        ? {
            nodename: unameSample.metric.nodename ?? '',
            release: unameSample.metric.release ?? '',
            version: unameSample.metric.version ?? '',
            machine: unameSample.metric.machine ?? '',
          }
        : null

    const disks: DiskUsage[] = pick(mDisk, hostname)
      .map((s) => ({
        device: s.metric.device ?? '',
        mount: s.metric.mountpoint ?? '',
        percent: clampPercent(toNum(s.value[1])),
      }))
      // 零尺寸/不可读的文件系统(如 portal 挂载)percent 为 null,直接排除
      .filter((d) => d.percent !== null)
    disks.sort((a, b) => (a.mount > b.mount ? 1 : -1))
    const diskMaxPercent = maxOf(disks.map((d) => d.percent))

    const memTotalB = firstValue(pick(mMemTotal, hostname))
    const memAvailB = firstValue(pick(mMemAvail, hostname))
    const memUsedB = memTotalB !== null && memAvailB !== null ? memTotalB - memAvailB : null

    const gpuPartials = [...(gpuAcc.get(hostname)?.values() ?? [])].sort(
      (a, b) => Number(a.index) - Number(b.index),
    )
    const nowMs = Date.now()
    for (const g of gpuPartials) lastOnlineAt.set(`${hostname}/${g.index}`, nowMs)
    const gpus: GpuSnapshot[] = gpuPartials.map((g) => ({
      index: g.index,
      uuid: g.uuid,
      device: g.device,
      model: g.model,
      driver: g.driver,
      present: true,
      missingKind: null,
      lastSeenMs: null,
      util: g.util,
      memUtil: g.memUtil,
      memUsedMiB: g.fbUsed,
      memTotalMiB: g.fbUsed !== null && g.fbFree !== null ? g.fbUsed + g.fbFree : null,
      tempC: g.tempC,
      memTempC: g.memTempC,
      powerW: g.powerW,
      smClockMHz: g.smClockMHz,
      memClockMHz: g.memClockMHz,
    }))
    // 掉线占位:指标全部置空,保留窗口内最后一次的型号/驱动等标签。
    // dcgm 采集器整机离线时该卡状态实为"未知"而非"掉卡",标为 collector:
    // 前端区别展示(黄色),下方单卡掉线告警也按 dcgmUp 门控而跳过
    for (const [idx, seen] of gpuSeen.get(hostname) ?? []) {
      if (gpuPartials.some((g) => g.index === idx)) continue
      gpus.push({
        index: idx,
        uuid: seen.UUID ?? '',
        device: seen.device ?? '',
        model: seen.modelName ?? '',
        driver: seen.DCGM_FI_DRIVER_VERSION ?? '',
        present: false,
        missingKind: dcgmUp ? 'gpu' : 'collector',
        lastSeenMs: lastOnlineAt.get(`${hostname}/${idx}`) ?? null,
        util: null,
        memUtil: null,
        memUsedMiB: null,
        memTotalMiB: null,
        tempC: null,
        memTempC: null,
        powerW: null,
        smClockMHz: null,
        memClockMHz: null,
      })
    }
    gpus.sort((a, b) => Number(a.index) - Number(b.index))
    const liveGpuCount = gpuPartials.length

    const gpuUtilAvg = avgOf(gpus.map((g) => g.util))
    const gpuTempMax = maxOf(gpus.map((g) => g.tempC))
    const gpuPowerW = sumOf(gpus.map((g) => g.powerW))
    const gpuMemUsedMiB = sumOf(gpus.map((g) => g.memUsedMiB))
    const gpuMemTotalMiB = sumOf(
      gpus.map((g) => (g.memUsedMiB !== null && g.memTotalMiB !== null ? g.memTotalMiB : null)),
    )

    const cpuPct = clampPercent(firstValue(pick(mCpu, hostname)))
    const memPct =
      memTotalB !== null && memAvailB !== null && memTotalB > 0
        ? clampPercent((1 - memAvailB / memTotalB) * 100)
        : null

    const alerts: AlertInfo[] = []
    if (!nodeUp) {
      alerts.push({ level: 'critical', title: '节点离线' })
    } else {
      // 整机 dcgm 离线时占位卡依然会补出,判断"采集器离线"要看实时卡数
      if (!dcgmUp && liveGpuCount === 0)
        alerts.push({ level: 'warning', title: 'GPU 采集器(dcgm)离线' })
      if (dcgmUp) {
        for (const g of gpus) {
          if (!g.present)
            alerts.push({
              level: 'critical',
              title: `GPU${g.index} 掉线${g.lastSeenMs ? ` ${formatSince(g.lastSeenMs)}` : ''}`,
            })
        }
      }
      if (cpuPct !== null && cpuPct > THRESHOLDS.cpuPercent)
        alerts.push({ level: 'warning', title: `CPU 使用率 ${cpuPct.toFixed(0)}%` })
      if (memPct !== null && memPct > THRESHOLDS.memPercent)
        alerts.push({ level: 'warning', title: `内存使用率 ${memPct.toFixed(0)}%` })
      if (diskMaxPercent !== null && diskMaxPercent > THRESHOLDS.diskPercent) {
        const worst = disks.find((d) => d.percent === diskMaxPercent)
        alerts.push({
          level: 'warning',
          title: `磁盘 ${worst?.mount ?? ''} 使用率 ${diskMaxPercent.toFixed(0)}%`,
        })
      }
      if (gpuTempMax !== null && gpuTempMax > THRESHOLDS.gpuTempC) {
        const hottest = gpus.find((g) => g.tempC === gpuTempMax)
        alerts.push({
          level: 'warning',
          title: `GPU${hottest?.index ?? ''} 温度 ${gpuTempMax.toFixed(0)}°C`,
        })
      }
      for (const g of gpus) {
        if (
          g.memUsedMiB !== null &&
          g.memTotalMiB !== null &&
          g.memTotalMiB > 0 &&
          (g.memUsedMiB / g.memTotalMiB) * 100 > THRESHOLDS.gpuMemPercent
        )
          alerts.push({ level: 'warning', title: `GPU${g.index} 显存使用率过高` })
      }
    }

    hosts.push({
      hostname,
      ip,
      nodeUp,
      dcgmUp,
      cores: firstValue(pick(mCores, hostname)),
      uptimeSeconds: firstValue(pick(mUptime, hostname)),
      cpuPercent: cpuPct,
      load1: firstValue(pick(mLoad1, hostname)),
      load5: firstValue(pick(mLoad5, hostname)),
      memTotalBytes: memTotalB,
      memUsedBytes: memUsedB,
      memPercent: memPct,
      disks,
      diskMaxPercent,
      os,
      gpus,
      gpuUtilAvg,
      gpuTempMax,
      gpuPowerW,
      gpuMemUsedMiB,
      gpuMemTotalMiB,
      alerts,
    })
  }
  hosts.sort((a, b) => a.hostname.localeCompare(b.hostname))

  // 集群汇总(性能指标只统计在线节点)
  const upHosts = hosts.filter((h) => h.nodeUp)
  const allGpus = hosts.flatMap((h) => (h.dcgmUp ? h.gpus : []))
  const memUsedSum = sumOf(upHosts.map((h) => h.memUsedBytes))
  const memTotalSum = sumOf(upHosts.map((h) => h.memTotalBytes))
  let hottestGpuHost: string | null = null
  let gpuTempMax: number | null = null
  for (const h of upHosts) {
    if (h.gpuTempMax !== null && (gpuTempMax === null || h.gpuTempMax > gpuTempMax)) {
      gpuTempMax = h.gpuTempMax
      hottestGpuHost = h.hostname
    }
  }
  const cluster: ClusterSummary = {
    hostsTotal: hosts.length,
    hostsUp: upHosts.length,
    gpusTotal: allGpus.length,
    gpusUp: upHosts.flatMap((h) => h.gpus).filter((g) => g.present).length,
    cpuPercent: avgOf(upHosts.map((h) => h.cpuPercent)),
    memUsedBytes: memUsedSum,
    memTotalBytes: memTotalSum,
    memPercent:
      memUsedSum !== null && memTotalSum !== null && memTotalSum > 0
        ? (memUsedSum / memTotalSum) * 100
        : null,
    gpuUtilAvg: avgOf(allGpus.map((g) => g.util)),
    gpuMemUsedMiB: sumOf(allGpus.map((g) => g.memUsedMiB)),
    gpuMemTotalMiB: sumOf(
      allGpus.map((g) => (g.memUsedMiB !== null && g.memTotalMiB !== null ? g.memTotalMiB : null)),
    ),
    gpuPowerW: sumOf(allGpus.map((g) => g.powerW)),
    gpuTempMax,
    hottestGpuHost,
  }

  // 1h 集群趋势
  const endS = Math.floor(Date.now() / 1000)
  const startS = endS - TREND_RANGE_SEC
  const [trendCpu, trendMem, trendGpuUtil] = await Promise.all([
    rangeQuery(TREND_QUERIES.cpu, startS, endS, TREND_STEP_SEC),
    rangeQuery(TREND_QUERIES.mem, startS, endS, TREND_STEP_SEC),
    rangeQuery(TREND_QUERIES.gpuUtil, startS, endS, TREND_STEP_SEC),
  ])

  return {
    generatedAt: Date.now(),
    prometheus: { url: PROM_URL },
    cluster,
    hosts,
    trends: {
      cpu: seriesOf(trendCpu),
      mem: seriesOf(trendMem),
      gpuUtil: seriesOf(trendGpuUtil),
    } satisfies OverviewResponse['trends'],
  }
}

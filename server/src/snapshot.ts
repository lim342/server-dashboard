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
    const gpus: GpuSnapshot[] = gpuPartials.map((g) => ({
      index: g.index,
      uuid: g.uuid,
      device: g.device,
      model: g.model,
      driver: g.driver,
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
      if (!dcgmUp && gpus.length === 0)
        alerts.push({ level: 'warning', title: 'GPU 采集器(dcgm)离线' })
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
    gpusUp: upHosts.flatMap((h) => h.gpus).length,
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

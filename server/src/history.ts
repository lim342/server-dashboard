// 详情页历史曲线数据:按 hostname + 时间范围并行查询

import { rangeQuery, type PromSeries } from './prometheus.js'
import { hostHistoryQueries, RANGES, stepFor } from './queries.js'
import { seriesOf } from './snapshot.js'
import type { GpuHistory, HostHistoryResponse, Series } from './types.js'

function namedSeries(samples: PromSeries[]): Series[] {
  return samples.map((s) => ({ name: s.metric.device ?? '?', ...seriesOf([s]) }))
}

function groupGpuSeries(samples: PromSeries[]): Record<string, Series> {
  const out: Record<string, Series> = {}
  for (const s of samples) {
    out[s.metric.gpu ?? '?'] = seriesOf([s])
  }
  return out
}

// 该指标在不支持的卡(4090/T4)上恒为 0,统一归一为 null 避免画出 0°C 假线
function zeroToNull(record: Record<string, Series>): Record<string, Series> {
  for (const k of Object.keys(record)) {
    record[k] = { ...record[k], values: record[k].values.map((v) => (v === 0 ? null : v)) }
  }
  return record
}

export interface HistoryWindow {
  /** 预设档位(与 startS/endS 二选一) */
  range?: string
  /** 自定义窗口,秒级时间戳 */
  startS?: number
  endS?: number
}

/** 小并发池执行:18 条查询一齐打出去会压垮 Prometheus(互相拖慢、集体超时),
 *  限到 6 条在途,完成的立刻补位。失败不中断其它任务,结果里 error 为该任务的异常 */
async function runPooled<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<(T | Error)[]> {
  const results: (T | Error)[] = new Array(tasks.length)
  let next = 0
  async function worker() {
    while (next < tasks.length) {
      const i = next++
      try {
        results[i] = await tasks[i]()
      } catch (e) {
        results[i] = e instanceof Error ? e : new Error(String(e))
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return results
}

export async function collectHostHistory(
  hostname: string,
  opts: HistoryWindow,
): Promise<HostHistoryResponse> {
  let startS: number
  let endS: number
  let step: number
  let rangeLabel: string
  if (opts.startS !== undefined && opts.endS !== undefined) {
    startS = opts.startS
    endS = opts.endS
    step = stepFor(endS - startS)
    rangeLabel = 'custom'
  } else {
    const cfg = RANGES[opts.range ?? '1h'] ?? RANGES['1h']
    endS = Math.floor(Date.now() / 1000)
    startS = endS - cfg.sec
    step = cfg.step
    rangeLabel = opts.range ?? '1h'
  }
  const q = hostHistoryQueries(hostname)
  const run = (promql: string) => rangeQuery(promql, startS, endS, step)

  // 部分失败容忍:长窗口下单条查询超时只丢该指标(图表显示为空),
  // 全部失败才向上抛——那说明 Prometheus 真不可用
  const keys = Object.keys(q) as (keyof typeof q)[]
  const pooled = await runPooled(
    keys.map((k) => () => run(q[k])),
    6,
  )
  const results = {} as Record<keyof typeof q, PromSeries[]>
  const errors: Error[] = []
  keys.forEach((k, i) => {
    const r = pooled[i]
    if (r instanceof Error) {
      results[k] = []
      errors.push(r)
    } else {
      results[k] = r
    }
  })
  if (errors.length === keys.length) throw errors[0]
  const {
    cpu,
    load1,
    load5,
    load15,
    memUsed,
    memAvailable,
    memCached,
    swapUsed,
    netRx,
    netTx,
    gpuUtil,
    gpuMemUtil,
    gpuFbUsed,
    gpuTemp,
    gpuMemTemp,
    gpuPower,
    gpuSmClock,
    gpuMemClock,
  } = results

  const gpus: GpuHistory = {
    util: groupGpuSeries(gpuUtil),
    memUtil: groupGpuSeries(gpuMemUtil),
    memUsedMiB: groupGpuSeries(gpuFbUsed),
    tempC: groupGpuSeries(gpuTemp),
    memTempC: zeroToNull(groupGpuSeries(gpuMemTemp)),
    powerW: groupGpuSeries(gpuPower),
    smClockMHz: groupGpuSeries(gpuSmClock),
    memClockMHz: groupGpuSeries(gpuMemClock),
  }
  const hasGpu = Object.keys(gpus.util).length > 0

  return {
    hostname,
    range: rangeLabel,
    step,
    start: startS * 1000,
    end: endS * 1000,
    cpu: seriesOf(cpu),
    load1: seriesOf(load1),
    load5: seriesOf(load5),
    load15: seriesOf(load15),
    memUsed: seriesOf(memUsed),
    memAvailable: seriesOf(memAvailable),
    memCached: seriesOf(memCached),
    swapUsed: seriesOf(swapUsed),
    netRx: namedSeries(netRx),
    netTx: namedSeries(netTx),
    hasNetwork: netRx.length > 0 || netTx.length > 0,
    hasGpu,
    gpus,
  }
}

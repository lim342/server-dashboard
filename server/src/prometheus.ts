// Prometheus HTTP API 客户端:查询 + 简单 TTL 缓存
import { PROM_URL } from './config.js'

export { PROM_URL }

export class PrometheusError extends Error {}

export interface PromSample {
  metric: Record<string, string>
  value: [number, string]
}

export interface PromSeries {
  metric: Record<string, string>
  values: [number, string][]
}

async function promGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(path, PROM_URL)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  let res: Response
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json' },
    })
  } catch (e) {
    throw new PrometheusError(`无法连接 Prometheus (${PROM_URL}):${(e as Error).message}`)
  }
  if (!res.ok) throw new PrometheusError(`Prometheus 返回 HTTP ${res.status}`)
  let body: { status?: string; error?: string; data?: T }
  try {
    body = await res.json()
  } catch {
    throw new PrometheusError(`Prometheus 返回了非 JSON 响应(HTTP ${res.status})`)
  }
  if (body.status !== 'success') throw new PrometheusError(`查询失败:${body.error ?? '未知错误'}`)
  return body.data as T
}

export async function instantQuery(promql: string): Promise<PromSample[]> {
  const data = await promGet<{ resultType: string; result: PromSample[] }>('/api/v1/query', {
    query: promql,
    time: String(Math.floor(Date.now() / 1000)),
  })
  return data.result ?? []
}

export async function rangeQuery(
  promql: string,
  startS: number,
  endS: number,
  stepS: number,
): Promise<PromSeries[]> {
  const data = await promGet<{ resultType: string; result: PromSeries[] }>('/api/v1/query_range', {
    query: promql,
    start: String(startS),
    end: String(endS),
    step: String(stepS),
  })
  return data.result ?? []
}

export async function prometheusVersion(): Promise<string | null> {
  try {
    const b = await promGet<{ version: string }>('/api/v1/status/buildinfo', {})
    return b.version ?? null
  } catch {
    return null
  }
}

// 极简 TTL 缓存:多个浏览器同时轮询时避免打爆 Prometheus
const cache = new Map<string, { at: number; value: unknown }>()

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T
  const value = await fn()
  cache.set(key, { at: Date.now(), value })
  return value
}

export function toNum(raw: string | undefined): number | null {
  if (raw === undefined || raw === 'NaN') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export function firstValue(samples: PromSample[]): number | null {
  for (const s of samples) {
    const v = toNum(s.value[1])
    if (v !== null) return v
  }
  return null
}

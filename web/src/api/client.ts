import type { HealthResponse, HostHistoryResponse, HostSnapshot, OverviewResponse } from './types'

async function apiGet<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, { headers: { Accept: 'application/json' } })
  } catch (e) {
    throw new Error(`无法连接后端服务:${(e as Error).message}`)
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: string }
      if (typeof body.error === 'string') msg = body.error
    } catch {
      /* 保留默认消息 */
    }
    throw new Error(msg)
  }
  return (await res.json()) as T
}

export const fetchOverview = () => apiGet<OverviewResponse>('/api/overview')

export const fetchHost = (hostname: string) =>
  apiGet<HostSnapshot>(`/api/hosts/${encodeURIComponent(hostname)}`)

export type HistoryRange = string | { start: number; end: number }

export const fetchHistory = (hostname: string, range: HistoryRange) => {
  const qs =
    typeof range === 'string'
      ? `range=${encodeURIComponent(range)}`
      : `start=${Math.round(range.start)}&end=${Math.round(range.end)}`
  return apiGet<HostHistoryResponse>(`/api/hosts/${encodeURIComponent(hostname)}/history?${qs}`)
}

export const fetchHealth = () => apiGet<HealthResponse>('/api/health')

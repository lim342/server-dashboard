// 与前端 web/src/api/types.ts 保持一致的数据结构

export interface AlertInfo {
  level: 'critical' | 'warning'
  title: string
}

export interface GpuSnapshot {
  index: string
  uuid: string
  device: string
  model: string
  driver: string
  util: number | null
  memUtil: number | null
  memUsedMiB: number | null
  memTotalMiB: number | null
  tempC: number | null
  memTempC: number | null
  powerW: number | null
  smClockMHz: number | null
  memClockMHz: number | null
}

export interface DiskUsage {
  device: string
  mount: string
  percent: number | null
}

export interface OsInfo {
  nodename: string
  release: string
  version: string
  machine: string
}

export interface HostSnapshot {
  hostname: string
  ip: string | null
  nodeUp: boolean
  dcgmUp: boolean
  cores: number | null
  uptimeSeconds: number | null
  cpuPercent: number | null
  load1: number | null
  load5: number | null
  memTotalBytes: number | null
  memUsedBytes: number | null
  memPercent: number | null
  disks: DiskUsage[]
  diskMaxPercent: number | null
  os: OsInfo | null
  gpus: GpuSnapshot[]
  gpuUtilAvg: number | null
  gpuTempMax: number | null
  gpuPowerW: number | null
  gpuMemUsedMiB: number | null
  gpuMemTotalMiB: number | null
  alerts: AlertInfo[]
}

export interface ClusterSummary {
  hostsTotal: number
  hostsUp: number
  gpusTotal: number
  gpusUp: number
  cpuPercent: number | null
  memUsedBytes: number | null
  memTotalBytes: number | null
  memPercent: number | null
  gpuUtilAvg: number | null
  gpuMemUsedMiB: number | null
  gpuMemTotalMiB: number | null
  gpuPowerW: number | null
  gpuTempMax: number | null
  hottestGpuHost: string | null
}

export interface TrendSeries {
  ts: number[]
  values: (number | null)[]
}

export interface OverviewResponse {
  generatedAt: number
  prometheus: { url: string }
  cluster: ClusterSummary
  hosts: HostSnapshot[]
  trends: {
    cpu: TrendSeries
    mem: TrendSeries
    gpuUtil: TrendSeries
  }
}

export interface Series {
  name?: string
  ts: number[]
  values: (number | null)[]
}

export interface GpuHistory {
  util: Record<string, Series>
  memUtil: Record<string, Series>
  memUsedMiB: Record<string, Series>
  tempC: Record<string, Series>
  memTempC: Record<string, Series>
  powerW: Record<string, Series>
  smClockMHz: Record<string, Series>
  memClockMHz: Record<string, Series>
}

export interface HostHistoryResponse {
  hostname: string
  range: string
  step: number
  start: number
  end: number
  cpu: Series
  load1: Series
  load5: Series
  load15: Series
  memUsed: Series
  memAvailable: Series
  memCached: Series
  swapUsed: Series
  netRx: Series[]
  netTx: Series[]
  hasNetwork: boolean
  hasGpu: boolean
  gpus: GpuHistory
}

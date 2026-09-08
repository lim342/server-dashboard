// 全部 PromQL 与阈值常量的单一出处

export const THRESHOLDS = {
  cpuPercent: 90,
  memPercent: 90,
  diskPercent: 90,
  gpuTempC: 85,
  gpuMemPercent: 95,
}

const FS_FILTER =
  'fstype!~"tmpfs|devtmpfs|overlay|squashfs|iso9660|nsfs|ramfs|efivarfs|tracefs|autofs",' +
  'mountpoint!~"/run/.*|/var/snap/.*|/snap/.*"'
const NET_DEV_FILTER =
  'device!~"lo|docker.*|br-.*|veth.*|tailscale.*|cni.*|flannel.*|calico.*|vxlan.*|geneve.*|kube-ipvs.*|nodelocaldns.*|tunl.*|tun[0-9]*|tap.*|virbr.*|dummy.*"'

/** 即时查询:一次拿到所有主机的当前快照 */
export const INSTANT_QUERIES = {
  upNode: 'up{job="node"}',
  upDcgm: 'up{job="dcgm"}',
  cpuPercent: '100 - 100 * avg by (hostname) (rate(node_cpu_seconds_total{mode="idle"}[2m]))',
  cores: 'count by (hostname) (node_cpu_seconds_total{mode="idle"})',
  load1: 'node_load1',
  load5: 'node_load5',
  memTotal: 'node_memory_MemTotal_bytes',
  memAvailable: 'node_memory_MemAvailable_bytes',
  diskPercent: `100 * (1 - node_filesystem_avail_bytes{${FS_FILTER}} / node_filesystem_size_bytes{${FS_FILTER}})`,
  uptime: 'time() - node_boot_time_seconds',
  uname: 'node_uname_info',
  gpuUtil: 'DCGM_FI_DEV_GPU_UTIL',
  gpuMemUtil: 'DCGM_FI_DEV_MEM_COPY_UTIL',
  gpuFbUsed: 'DCGM_FI_DEV_FB_USED',
  gpuFbFree: 'DCGM_FI_DEV_FB_FREE',
  gpuTemp: 'DCGM_FI_DEV_GPU_TEMP',
  gpuMemTemp: 'DCGM_FI_DEV_MEMORY_TEMP',
  gpuPower: 'DCGM_FI_DEV_POWER_USAGE',
  gpuSmClock: 'DCGM_FI_DEV_SM_CLOCK',
  gpuMemClock: 'DCGM_FI_DEV_MEM_CLOCK',
} as const

/** 总览页 1h 趋势(集群级) */
export const TREND_QUERIES = {
  cpu: '100 - 100 * avg(rate(node_cpu_seconds_total{mode="idle"}[2m]))',
  mem: '100 * (1 - sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes))',
  gpuUtil: 'avg(DCGM_FI_DEV_GPU_UTIL)',
} as const

export const TREND_RANGE_SEC = 3600
export const TREND_STEP_SEC = 120

/** 详情页历史查询(按 hostname 过滤) */
export function hostHistoryQueries(hostname: string) {
  const h = JSON.stringify(hostname) // 防 PromQL 注入(hostname 来自路由参数)
  const label = `hostname=${h}`
  return {
    cpu: `100 - 100 * avg(rate(node_cpu_seconds_total{${label},mode="idle"}[2m]))`,
    load1: `node_load1{${label}}`,
    load5: `node_load5{${label}}`,
    load15: `node_load15{${label}}`,
    memUsed: `node_memory_MemTotal_bytes{${label}} - node_memory_MemAvailable_bytes{${label}}`,
    memAvailable: `node_memory_MemAvailable_bytes{${label}}`,
    memCached: `node_memory_Cached_bytes{${label}}`,
    swapUsed: `node_memory_SwapTotal_bytes{${label}} - node_memory_SwapFree_bytes{${label}}`,
    netRx: `sum by (device) (rate(node_network_receive_bytes_total{${label},${NET_DEV_FILTER}}[2m]))`,
    netTx: `sum by (device) (rate(node_network_transmit_bytes_total{${label},${NET_DEV_FILTER}}[2m]))`,
    gpuUtil: `DCGM_FI_DEV_GPU_UTIL{${label}}`,
    gpuMemUtil: `DCGM_FI_DEV_MEM_COPY_UTIL{${label}}`,
    gpuFbUsed: `DCGM_FI_DEV_FB_USED{${label}}`,
    gpuTemp: `DCGM_FI_DEV_GPU_TEMP{${label}}`,
    gpuMemTemp: `DCGM_FI_DEV_MEMORY_TEMP{${label}}`,
    gpuPower: `DCGM_FI_DEV_POWER_USAGE{${label}}`,
    gpuSmClock: `DCGM_FI_DEV_SM_CLOCK{${label}}`,
    gpuMemClock: `DCGM_FI_DEV_MEM_CLOCK{${label}}`,
  }
}

export const RANGES: Record<string, { sec: number; step: number }> = {
  '1h': { sec: 3600, step: 30 },
  '6h': { sec: 6 * 3600, step: 120 },
  '24h': { sec: 24 * 3600, step: 480 },
  '7d': { sec: 7 * 24 * 3600, step: 1800 },
}

/** 自定义时间窗口的边界 */
export const CUSTOM_RANGE_LIMITS = {
  minSec: 10 * 60, // 至少 10 分钟
  maxSec: 31 * 86400, // 最多 31 天
}

/** 按窗口长度自动选采样步长(目标 ~160 个点,取整齐值) */
export function stepFor(rangeSec: number): number {
  const raw = Math.max(10, Math.ceil(rangeSec / 160))
  const steps = [10, 15, 30, 60, 120, 180, 300, 600, 900, 1800, 3600, 7200, 14400, 43200, 86400]
  for (const s of steps) if (raw <= s) return s
  return 86400
}

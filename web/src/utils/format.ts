// 数值/文本格式化工具

export function formatBytes(bytes: number | null | undefined, digits = 1): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']
  let v = bytes
  let i = 0
  while (Math.abs(v) >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  const d = i === 0 || v >= 100 ? 0 : digits
  return `${v.toFixed(d)} ${units[i]}`
}

export function formatMiB(mib: number | null | undefined, digits = 1): string {
  if (mib === null || mib === undefined || !Number.isFinite(mib)) return '—'
  return formatBytes(mib * 1024 * 1024, digits)
}

export function formatRate(bytesPerSec: number | null | undefined): string {
  if (bytesPerSec === null || bytesPerSec === undefined || !Number.isFinite(bytesPerSec)) return '—'
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  let v = bytesPerSec
  let i = 0
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000
    i++
  }
  const d = i === 0 || v >= 100 ? 0 : 1
  return `${v.toFixed(d)} ${units[i]}`
}

export function formatUptime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0)
    return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d} 天 ${h} 小时`
  if (h > 0) return `${h} 小时 ${m} 分`
  return `${m} 分`
}

export function fmt(v: number | null | undefined, digits = 0, suffix = ''): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return `${v.toFixed(digits)}${suffix}`
}

export function fmtW(w: number | null | undefined): string {
  if (w === null || w === undefined || !Number.isFinite(w)) return '—'
  return w >= 1000 ? `${(w / 1000).toFixed(2)} kW` : `${w.toFixed(0)} W`
}

export function shortGpuModel(model: string): string {
  return model
    .replace(/^NVIDIA\s+/, '')
    .replace(/^Tesla\s+/, '')
    .replace(/^GeForce\s+/, '')
    .replace(/-PCIE-\d+GB$/, '')
    .trim()
}

export interface OsPretty {
  name: string
  kernel: string
  arch: string
}

export function osPretty(os: { nodename: string; release: string; version: string; machine: string } | null): OsPretty | null {
  if (!os) return null
  // 常见两种格式:"... Ubuntu 22.04 ..." 或 "#40~22.04.3-Ubuntu SMP ..."
  const direct = os.version.match(/Ubuntu\s*([\d.]+)/i)
  if (direct) return { name: `Ubuntu ${direct[1]}`, kernel: os.release, arch: os.machine }
  const reversed = os.version.match(/#?\d*~?([\d]+\.[\d]+(?:\.[\d]+)?)-Ubuntu/i)
  if (reversed) return { name: `Ubuntu ${reversed[1]}`, kernel: os.release, arch: os.machine }
  return { name: os.nodename, kernel: os.release, arch: os.machine }
}

// 数值 → 状态色(浅色主题)
export function utilColor(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '#cbd5e1'
  if (v >= 85) return '#ef4444'
  if (v >= 60) return '#f59e0b'
  return '#3b82f6'
}

export function tempColor(t: number | null | undefined): string {
  if (t === null || t === undefined || !Number.isFinite(t)) return '#cbd5e1'
  if (t >= 85) return '#ef4444'
  if (t >= 70) return '#f59e0b'
  return '#3b82f6'
}

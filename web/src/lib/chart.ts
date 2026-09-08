// ECharts option 构造器(浅色主题)
import type { ChartOption } from './echarts'
import type { DiskUsage, Series } from '@/api/types'
import { utilColor } from '@/utils/format'

export const PALETTE = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#f97316',
  '#14b8a6',
  '#6366f1',
]

export function toData(s: Series | undefined): [number, number | null][] {
  if (!s) return []
  return s.ts.map((t, i) => [t, s.values[i] ?? null])
}

export interface LineSpec {
  name: string
  data: [number, number | null][]
  color?: string
  area?: boolean
  stack?: string
  yAxisIndex?: number
  dashed?: boolean
  width?: number
  /** 该序列的 tooltip 值格式化(如 "210 MHz"),覆盖 LineOpts.fmt */
  fmt?: (v: number) => string
}

export interface LineOpts {
  fmt?: (v: number) => string
  axisFmt?: (v: number) => string
  yMin?: number
  yMax?: number
  secondAxisFmt?: (v: number) => string
}

export function lineChart(specs: LineSpec[], o: LineOpts = {}): ChartOption {
  const defaultFmt = (n: number) => (o.fmt ? o.fmt(n) : String(Math.round(n * 100) / 100))
  const seriesFmt = new Map<string, (v: number) => string>()
  for (const s of specs) seriesFmt.set(s.name, s.fmt ?? defaultFmt)

  const formatValue = (seriesName: string, v: unknown): string => {
    const n = Number(v)
    if (v == null || !Number.isFinite(n)) return '—'
    const f = seriesFmt.get(seriesName)
    return f ? f(n) : String(Math.round(n * 100) / 100)
  }

  // 双轴图里不同序列单位不同,tooltip 必须按各自序列格式化
  const tooltipFormatter = (params: unknown): string => {
    const list = (Array.isArray(params) ? params : [params]) as Array<{
      marker?: string
      seriesName?: string
      value?: [number, number | null] | number
      axisValueLabel?: string
    }>
    if (!list.length) return ''
    const head = list[0].axisValueLabel ?? ''
    const lines = list.map((p) => {
      const v = Array.isArray(p.value) ? p.value[1] : p.value
      return `${p.marker ?? ''} ${p.seriesName ?? ''}: <b>${formatValue(p.seriesName ?? '', v)}</b>`
    })
    return `<div style="font-weight:600">${head}</div>${lines.join('<br/>')}`
  }
  const yAxes: object[] = [
    {
      type: 'value',
      min: o.yMin,
      max: o.yMax,
      axisLabel: {
        color: '#94a3b8',
        fontSize: 10,
        formatter: (v: number) => (o.axisFmt ? o.axisFmt(v) : String(v)),
      },
      splitLine: { lineStyle: { color: '#f1f5f9' } },
    },
  ]
  const hasSecond = specs.some((s) => s.yAxisIndex === 1)
  if (hasSecond) {
    yAxes.push({
      type: 'value',
      axisLabel: {
        color: '#94a3b8',
        fontSize: 10,
        formatter: (v: number) => (o.secondAxisFmt ? o.secondAxisFmt(v) : String(v)),
      },
      splitLine: { show: false },
    })
  }
  return {
    animation: false,
    color: PALETTE,
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.97)',
      borderColor: '#e2e8f0',
      textStyle: { color: '#334155', fontSize: 12 },
      formatter: tooltipFormatter,
    },
    legend: {
      top: 0,
      right: 0,
      icon: 'roundRect',
      itemWidth: 12,
      itemHeight: 4,
      itemGap: 14,
      textStyle: { fontSize: 11, color: '#64748b' },
    },
    grid: { left: 56, right: hasSecond ? 56 : 18, top: 34, bottom: 26 },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisLabel: { color: '#94a3b8', fontSize: 10, hideOverlap: true },
      splitLine: { show: false },
    },
    yAxis: yAxes,
    series: specs.map((s) => ({
      name: s.name,
      type: 'line' as const,
      data: s.data,
      showSymbol: false,
      smooth: 0.2,
      lineStyle: {
        width: s.width ?? 1.6,
        type: s.dashed ? ('dashed' as const) : ('solid' as const),
      },
      itemStyle: s.color ? { color: s.color } : undefined,
      color: s.color,
      areaStyle: s.area ? { opacity: 0.1 } : undefined,
      stack: s.stack,
      yAxisIndex: s.yAxisIndex,
      emphasis: { focus: 'series' },
    })),
  }
}

export function diskBarChart(disks: DiskUsage[], colorFn: (v: number | null) => string): ChartOption {
  return {
    animation: false,
    grid: { left: 120, right: 48, top: 10, bottom: 26 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.97)',
      borderColor: '#e2e8f0',
      textStyle: { color: '#334155', fontSize: 12 },
      valueFormatter: (v: unknown) => (v == null ? '—' : `${Number(v).toFixed(1)}%`),
    },
    xAxis: {
      type: 'value',
      max: 100,
      axisLabel: { formatter: '{value}%', color: '#94a3b8', fontSize: 10 },
      splitLine: { lineStyle: { color: '#f1f5f9' } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: disks.map((d) => d.mount),
      axisLabel: { color: '#475569', fontSize: 11 },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#e2e8f0' } },
    },
    series: [
      {
        type: 'bar',
        data: disks.map((d) => ({
          value: d.percent,
          itemStyle: { color: colorFn(d.percent), borderRadius: [0, 3, 3, 0] },
        })),
        barWidth: 14,
        label: {
          show: true,
          position: 'right',
          color: '#64748b',
          fontSize: 10,
          formatter: (p: { value: unknown }) =>
            p.value == null ? '—' : `${Math.round(Number(p.value))}%`,
        },
      },
    ],
  }
}

// 小型环形仪表(GPU 卡片当前值)
export function gaugeOption(
  value: number | null,
  o: { max?: number; unit?: string; color?: string } = {},
): ChartOption {
  const max = o.max ?? 100
  const v = value === null ? null : Math.min(max, Math.max(0, value))
  const pct = v === null ? 0 : (v / max) * 100
  return {
    animation: false,
    series: [
      {
        type: 'gauge',
        startAngle: 90,
        endAngle: -270,
        radius: '94%',
        center: ['50%', '50%'],
        min: 0,
        max,
        progress: {
          show: v !== null,
          width: 9,
          roundCap: true,
          itemStyle: { color: o.color ?? utilColor(pct) },
        },
        axisLine: { lineStyle: { width: 9, color: [[1, '#eef1f5']] } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        pointer: { show: false },
        anchor: { show: false },
        title: { show: false },
        detail: {
          offsetCenter: [0, 0],
          formatter: () =>
            v === null ? '—' : `${v < 10 ? v.toFixed(1) : Math.round(v)}${o.unit ?? '%'}`,
          color: '#1f2937',
          fontSize: 15,
          fontWeight: 650,
        },
        data: [{ value: v ?? 0 }],
      },
    ],
  }
}

export function sparkOption(s: Series | undefined, color = '#3b82f6'): ChartOption {  const data = toData(s).filter((d): d is [number, number] => d[1] !== null)
  return {
    animation: false,
    grid: { left: 0, right: 0, top: 3, bottom: 0 },
    xAxis: { type: 'time', show: false },
    yAxis: {
      type: 'value',
      show: false,
      min: 0,
      max: (v: { max: number }) => Math.max(v.max, 1) * 1.25,
    },
    series: [
      {
        type: 'line',
        data,
        showSymbol: false,
        smooth: 0.3,
        lineStyle: { width: 1.4, color },
        itemStyle: { color },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${color}38` },
              { offset: 1, color: `${color}00` },
            ],
          },
        },
      },
    ],
  }
}

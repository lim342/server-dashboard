<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NAlert,
  NButton,
  NDatePicker,
  NEmpty,
  NRadioButton,
  NRadioGroup,
  NSpin,
  NSwitch,
  NTag,
} from 'naive-ui'
import type { ChartOption } from '@/lib/echarts'
import type { HostHistoryResponse, HostSnapshot } from '@/api/types'
import { fetchHistory, fetchHost } from '@/api/client'
import { usePolling } from '@/composables/usePolling'
import MetricChart from '@/components/MetricChart.vue'
import GpuNowCard from '@/components/GpuNowCard.vue'
import StatusDot from '@/components/StatusDot.vue'
import { diskBarChart, lineChart, toData } from '@/lib/chart'
import {
  fmt,
  formatBytes,
  formatMiB,
  formatRate,
  formatUptime,
  osPretty,
  shortGpuModel,
  utilColor,
} from '@/utils/format'

const route = useRoute()
const router = useRouter()

const hostname = computed(() => String(route.params.hostname ?? ''))

const host = ref<HostSnapshot | null>(null)
const history = ref<HostHistoryResponse | null>(null)
const error = ref<string | null>(null)
const loading = ref(false)

const preset = ref('1h')
const customRange = ref<[number, number] | null>(null)
const autoRefresh = ref(true)
const selectedGpu = ref('0')

const RANGES_UI = ['1h', '6h', '24h', '7d']

const rangeOptions = [
  { label: '1 小时', value: '1h' },
  { label: '6 小时', value: '6h' },
  { label: '24 小时', value: '24h' },
  { label: '7 天', value: '7d' },
]

// 快捷档与自定义时间窗二选一:选了日期区间自动切到自定义,点快捷档则退回预设
const rangeValue = computed({
  get: () => (customRange.value ? 'custom' : preset.value),
  set: (v: string | number | null) => {
    if (typeof v === 'string' && RANGES_UI.includes(v)) {
      customRange.value = null
      preset.value = v
    }
  },
})

function disableFuture(ts: number): boolean {
  return ts > Date.now()
}

function onCustomUpdate(v: [number, number] | null) {
  if (!v || !v[0] || !v[1]) {
    customRange.value = null
    return
  }
  let [s, e] = v
  if (e - s < 60_000) {
    // 只点了同一天(两侧时间都是默认 00:00):按"整天"理解
    e = s + 24 * 3600 * 1000 - 1000
  }
  e = Math.min(e, Date.now())
  if (e - s < 10 * 60 * 1000) {
    // 后端要求最短 10 分钟:以终点为锚回推
    s = e - 10 * 60 * 1000
  }
  customRange.value = [s, e]
}

async function load() {
  if (!hostname.value) return
  loading.value = true
  try {
    const rangeParam = customRange.value
      ? { start: customRange.value[0], end: customRange.value[1] }
      : preset.value
    const [h, hist] = await Promise.all([
      fetchHost(hostname.value),
      fetchHistory(hostname.value, rangeParam),
    ])
    host.value = h
    history.value = hist
    error.value = null
    const keys = Object.keys(hist.gpus.util)
    if (keys.length && !keys.includes(selectedGpu.value)) selectedGpu.value = keys[0]
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

watch(hostname, () => {
  host.value = null
  history.value = null
  error.value = null
  // 支持 /host/:hostname?start=ms&end=ms 直接打开指定时间窗(可分享链接)
  const qs = route.query
  const qStart = Number(qs.start)
  const qEnd = Number(qs.end)
  if (
    Number.isFinite(qStart) &&
    Number.isFinite(qEnd) &&
    qStart > 0 &&
    qEnd > qStart + 10 * 60 * 1000
  ) {
    preset.value = RANGES_UI.includes(String(qs.range)) ? String(qs.range) : preset.value
    customRange.value = [qStart, Math.min(qEnd, Date.now())]
  }
  load()
}, { immediate: true })

watch(preset, () => load())
watch(customRange, (v) => {
  if (v) load()
})
usePolling(load, () => (autoRefresh.value ? 30_000 : 0))

const osInfo = computed(() => osPretty(host.value?.os ?? null))

const modelText = computed(() => {
  const m = new Map<string, number>()
  for (const g of host.value?.gpus ?? []) m.set(g.model, (m.get(g.model) ?? 0) + 1)
  return [...m.entries()].map(([k, n]) => `${shortGpuModel(k)} ×${n}`).join(' , ') || '—'
})

const EMPTY: { ts: number[]; values: (number | null)[] } = { ts: [], values: [] }

const cpuOption = computed<ChartOption | null>(() => {
  const h = history.value
  if (!h) return null
  return lineChart([{ name: 'CPU 使用率', data: toData(h.cpu), area: true, color: '#3b82f6' }], {
    yMin: 0,
    yMax: 100,
    fmt: (v) => `${v.toFixed(1)}%`,
    axisFmt: (v) => `${v}%`,
  })
})

const loadOption = computed<ChartOption | null>(() => {
  const h = history.value
  if (!h) return null
  return lineChart(
    [
      { name: 'load1', data: toData(h.load1), color: '#3b82f6' },
      { name: 'load5', data: toData(h.load5), color: '#f59e0b' },
      { name: 'load15', data: toData(h.load15), color: '#10b981' },
    ],
    { fmt: (v) => v.toFixed(2) },
  )
})

const memOption = computed<ChartOption | null>(() => {
  const h = history.value
  if (!h) return null
  return lineChart(
    [
      { name: '已用', data: toData(h.memUsed), area: true, stack: 'mem', color: '#3b82f6' },
      { name: '可用', data: toData(h.memAvailable), area: true, stack: 'mem', color: '#10b981' },
      { name: '缓存(cached)', data: toData(h.memCached), dashed: true, color: '#94a3b8' },
      { name: 'Swap 已用', data: toData(h.swapUsed), color: '#f59e0b' },
    ],
    { fmt: formatBytes, axisFmt: (v) => formatBytes(v, 0) },
  )
})

const diskOption = computed<ChartOption | null>(() => {
  if (!host.value?.disks.length) return null
  return diskBarChart(host.value.disks, (v) => utilColor(v))
})

const netOption = computed<ChartOption | null>(() => {
  const h = history.value
  if (!h || !h.hasNetwork) return null
  return lineChart(
    [
      ...h.netRx.map((s) => ({ name: `${s.name ?? '?'} ↓`, data: toData(s), color: '#3b82f6' })),
      ...h.netTx.map((s) => ({ name: `${s.name ?? '?'} ↑`, data: toData(s), color: '#10b981' })),
    ],
    { fmt: formatRate, axisFmt: (v) => formatRate(v) },
  )
})

const g = computed(() => history.value?.gpus)

const gpuUtilOption = computed<ChartOption | null>(() => {
  const x = g.value
  if (!x) return null
  return lineChart(
    [
      { name: '核心利用率', data: toData(x.util[selectedGpu.value] ?? EMPTY), area: true, color: '#3b82f6' },
      { name: '显存利用率', data: toData(x.memUtil[selectedGpu.value] ?? EMPTY), color: '#10b981' },
    ],
    { yMin: 0, yMax: 100, fmt: (v) => `${v.toFixed(1)}%`, axisFmt: (v) => `${v}%` },
  )
})

const gpuMemOption = computed<ChartOption | null>(() => {
  const x = g.value
  if (!x) return null
  // Y 轴上限固定为该卡总显存,直观看出占满程度
  const totalMiB =
    host.value?.gpus.find((gg) => gg.index === selectedGpu.value)?.memTotalMiB ?? undefined
  return lineChart(
    [
      {
        name: '显存占用',
        data: toData(x.memUsedMiB[selectedGpu.value] ?? EMPTY),
        area: true,
        color: '#8b5cf6',
      },
    ],
    { fmt: (v) => formatMiB(v), axisFmt: (v) => formatMiB(v, 0), yMax: totalMiB },
  )
})

const gpuTempOption = computed<ChartOption | null>(() => {
  const x = g.value
  if (!x) return null
  return lineChart(
    [
      { name: '核心温度', data: toData(x.tempC[selectedGpu.value] ?? EMPTY), color: '#f59e0b' },
      { name: '显存温度', data: toData(x.memTempC[selectedGpu.value] ?? EMPTY), color: '#ec4899' },
    ],
    { fmt: (v) => `${v.toFixed(0)}°C`, axisFmt: (v) => `${v}°` },
  )
})

const gpuPowerOption = computed<ChartOption | null>(() => {
  const x = g.value
  if (!x) return null
  return lineChart(
    [
      {
        name: '功耗',
        data: toData(x.powerW[selectedGpu.value] ?? EMPTY),
        area: true,
        color: '#ef4444',
        fmt: (v) => `${v.toFixed(1)} W`,
      },
      {
        name: 'SM 频率',
        data: toData(x.smClockMHz[selectedGpu.value] ?? EMPTY),
        dashed: true,
        yAxisIndex: 1,
        color: '#06b6d4',
        fmt: (v) => `${Math.round(v)} MHz`,
      },
      {
        name: '显存频率',
        data: toData(x.memClockMHz[selectedGpu.value] ?? EMPTY),
        dashed: true,
        yAxisIndex: 1,
        color: '#84cc16',
        fmt: (v) => `${Math.round(v)} MHz`,
      },
    ],
    { axisFmt: (v) => `${Math.round(v)} W`, secondAxisFmt: (v) => `${Math.round(v)} MHz` },
  )
})
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div class="topbar-left">
        <NButton size="small" quaternary @click="router.push('/')">← 返回</NButton>
        <StatusDot :ok="host?.nodeUp ?? false" />
        <span class="app-title">{{ hostname }}</span>
        <NTag v-if="host && !host.nodeUp" type="error" size="small" :bordered="false">离线</NTag>
        <NTag v-else-if="host" type="success" size="small" :bordered="false">在线</NTag>
      </div>
      <div class="topbar-right">
        <NRadioGroup v-model:value="rangeValue" size="small">
          <NRadioButton v-for="r in rangeOptions" :key="r.value" :value="r.value" :label="r.label" />
        </NRadioGroup>
        <NDatePicker
          :value="customRange"
          type="datetimerange"
          size="small"
          clearable
          format="yyyy-MM-dd HH:mm"
          :is-date-disabled="disableFuture"
          placeholder="自定义时间范围"
          style="width: 330px"
          @update:value="onCustomUpdate"
        />
        <span class="conn">自动刷新</span>
        <NSwitch v-model:value="autoRefresh" size="small" />
        <NButton size="small" :loading="loading" @click="load">刷新</NButton>
      </div>
    </header>

    <main class="content">
      <NAlert v-if="error" type="error" title="加载失败" style="margin-bottom: 16px">
        <div style="display: flex; align-items: center; gap: 10px">
          <span>{{ error }}</span>
          <NButton size="tiny" @click="load">重试</NButton>
        </div>
      </NAlert>

      <template v-if="host">
        <NAlert
          v-if="host.alerts.length"
          type="warning"
          title="当前告警"
          style="margin-bottom: 16px"
        >
          <span v-for="a in host.alerts" :key="a.title" class="alert-item">{{ a.title }}</span>
        </NAlert>

        <!-- 信息头 -->
        <section class="info-card">
          <div class="info-grid">
            <div class="info-item">
              <span class="ii-label">IP 地址</span><span class="ii-value">{{ host.ip ?? '—' }}</span>
            </div>
            <div class="info-item">
              <span class="ii-label">CPU</span>
              <span class="ii-value">{{ host.cores ?? '—' }} 核</span>
            </div>
            <div class="info-item">
              <span class="ii-label">内存</span>
              <span class="ii-value">{{ formatBytes(host.memTotalBytes) }}</span>
            </div>
            <div class="info-item">
              <span class="ii-label">负载 (1m/5m)</span>
              <span class="ii-value">{{ fmt(host.load1, 2) }} / {{ fmt(host.load5, 2) }}</span>
            </div>
            <div class="info-item">
              <span class="ii-label">运行时长</span>
              <span class="ii-value">{{ formatUptime(host.uptimeSeconds) }}</span>
            </div>
            <div class="info-item">
              <span class="ii-label">GPU</span>
              <span class="ii-value">{{ modelText }}</span>
            </div>
            <div class="info-item">
              <span class="ii-label">GPU 驱动</span>
              <span class="ii-value">{{ host.gpus[0]?.driver || '—' }}</span>
            </div>
            <div class="info-item">
              <span class="ii-label">操作系统</span>
              <span class="ii-value">{{ osInfo ? `${osInfo.name} (${osInfo.arch})` : '—' }}</span>
            </div>
            <div class="info-item">
              <span class="ii-label">内核</span>
              <span class="ii-value">{{ osInfo?.kernel ?? '—' }}</span>
            </div>
          </div>
        </section>

        <!-- GPU 当前状态 -->
        <section v-if="host.gpus.length" class="gpu-now">
          <GpuNowCard v-for="gpu1 in host.gpus" :key="gpu1.index" :gpu="gpu1" />
        </section>

        <template v-if="history">
          <div class="charts">
            <div class="chart-card">
              <div class="cc-title">CPU 使用率</div>
              <MetricChart v-if="cpuOption" :option="cpuOption" />
            </div>
            <div class="chart-card">
              <div class="cc-title">系统负载 (load)</div>
              <MetricChart v-if="loadOption" :option="loadOption" />
            </div>
            <div class="chart-card">
              <div class="cc-title">内存</div>
              <MetricChart v-if="memOption" :option="memOption" />
            </div>
            <div class="chart-card">
              <div class="cc-title">磁盘使用率</div>
              <MetricChart v-if="diskOption" :option="diskOption" />
              <NEmpty v-else description="无文件系统数据" style="padding: 60px 0" />
            </div>
            <div class="chart-card wide">
              <div class="cc-title">网络流量</div>
              <MetricChart v-if="netOption" :option="netOption" />
              <NEmpty
                v-else
                description="此节点未上报网络指标(node_exporter 版本可能过旧,建议升级到 1.8+)"
                style="padding: 60px 0"
              />
            </div>
          </div>

          <section v-if="history.hasGpu" class="gpu-section">
            <div class="gpu-section-head">
              <div class="section-title">GPU 历史</div>
              <NRadioGroup v-model:value="selectedGpu" size="small">
                <NRadioButton
                  v-for="gpu2 in host.gpus"
                  :key="gpu2.index"
                  :value="gpu2.index"
                  :label="`GPU${gpu2.index} · ${shortGpuModel(gpu2.model)}`"
                />
              </NRadioGroup>
            </div>
            <div class="charts">
              <div class="chart-card">
                <div class="cc-title">GPU{{ selectedGpu }} 利用率</div>
                <MetricChart v-if="gpuUtilOption" :option="gpuUtilOption" />
              </div>
              <div class="chart-card">
                <div class="cc-title">GPU{{ selectedGpu }} 显存占用</div>
                <MetricChart v-if="gpuMemOption" :option="gpuMemOption" />
              </div>
              <div class="chart-card">
                <div class="cc-title">GPU{{ selectedGpu }} 温度</div>
                <MetricChart v-if="gpuTempOption" :option="gpuTempOption" />
              </div>
              <div class="chart-card">
                <div class="cc-title">GPU{{ selectedGpu }} 功耗 / 频率</div>
                <MetricChart v-if="gpuPowerOption" :option="gpuPowerOption" />
              </div>
            </div>
          </section>
        </template>
      </template>

      <div v-else-if="!error" class="loading-wrap"><NSpin size="large" /></div>
    </main>
  </div>
</template>

<style scoped>
.alert-item:not(:last-child)::after {
  content: ' · ';
  margin: 0 4px;
}

.info-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px 18px;
  margin-bottom: 16px;
}
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 14px 24px;
}
.info-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.ii-label {
  font-size: 12px;
  color: var(--text2);
}
.ii-value {
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gpu-now {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.gpu-section {
  margin-top: 20px;
}
.gpu-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  gap: 12px;
}
.section-title {
  font-size: 15px;
  font-weight: 650;
}
</style>

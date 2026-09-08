<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NAlert, NButton, NInput, NRadioButton, NRadioGroup, NSelect, NSpin } from 'naive-ui'
import type { OverviewResponse } from '@/api/types'
import { fetchOverview } from '@/api/client'
import { usePolling } from '@/composables/usePolling'
import StatStrip from '@/components/StatStrip.vue'
import HostCard from '@/components/HostCard.vue'
import StatusDot from '@/components/StatusDot.vue'

const router = useRouter()

const data = ref<OverviewResponse | null>(null)
const error = ref<string | null>(null)
const loading = ref(false)
const lastUpdated = ref<Date | null>(null)

const interval = ref(15000)
const keyword = ref('')
const statusFilter = ref<'all' | 'up' | 'down' | 'alert'>('all')
const modelFilter = ref<string>('')

const intervalOptions = [
  { label: '手动刷新', value: 0 },
  { label: '每 15 秒', value: 15000 },
  { label: '每 30 秒', value: 30000 },
  { label: '每 60 秒', value: 60000 },
]

async function load() {
  loading.value = true
  try {
    data.value = await fetchOverview()
    error.value = null
    lastUpdated.value = new Date()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
load()
usePolling(load, () => interval.value)

const modelOptions = computed(() => {
  const s = new Set<string>()
  for (const h of data.value?.hosts ?? []) for (const g of h.gpus) s.add(g.model)
  return [
    { label: '全部 GPU 型号', value: '' },
    ...[...s].sort().map((m) => ({ label: m, value: m })),
  ]
})

const filteredHosts = computed(() => {
  let hosts = data.value?.hosts ?? []
  const kw = keyword.value.trim().toLowerCase()
  if (kw) {
    hosts = hosts.filter(
      (h) =>
        h.hostname.toLowerCase().includes(kw) ||
        (h.ip ?? '').includes(kw) ||
        h.gpus.some((g) => g.model.toLowerCase().includes(kw)) ||
        shortModelIncludes(h, kw),
    )
  }
  if (modelFilter.value) hosts = hosts.filter((h) => h.gpus.some((g) => g.model === modelFilter.value))
  if (statusFilter.value === 'up') hosts = hosts.filter((h) => h.nodeUp)
  else if (statusFilter.value === 'down') hosts = hosts.filter((h) => !h.nodeUp)
  else if (statusFilter.value === 'alert') hosts = hosts.filter((h) => h.alerts.length > 0)
  return hosts
})

function shortModelIncludes(h: { gpus: { model: string }[] }, kw: string): boolean {
  return h.gpus.some((g) =>
    g.model
      .toLowerCase()
      .replace(/^nvidia\s+/, '')
      .replace(/^tesla\s+/, '')
      .replace(/^geforce\s+/, '')
      .includes(kw),
  )
}

const alertHostCount = computed(
  () => (data.value?.hosts ?? []).filter((h) => h.alerts.length > 0).length,
)

function openHost(hostname: string) {
  router.push(`/host/${encodeURIComponent(hostname)}`)
}

const updatedText = computed(() =>
  lastUpdated.value ? lastUpdated.value.toLocaleTimeString('zh-CN', { hour12: false }) : '',
)
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div class="topbar-left">
        <div class="logo">SD</div>
        <span class="app-title">服务器监控</span>
        <span class="app-sub">node · dcgm · prometheus</span>
      </div>
      <div class="topbar-right">
        <span class="conn">
          <StatusDot :ok="!error" />
          {{ error ? '数据异常' : '数据正常' }}
          <template v-if="updatedText">· {{ updatedText }}</template>
        </span>
        <NSelect
          v-model:value="interval"
          :options="intervalOptions"
          size="small"
          style="width: 118px"
        />
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

      <template v-if="data">
        <StatStrip :cluster="data.cluster" :trends="data.trends" />

        <div class="filter-row">
          <NInput
            v-model:value="keyword"
            placeholder="搜索主机名 / IP / GPU 型号"
            size="small"
            clearable
            style="width: 250px"
          />
          <NRadioGroup v-model:value="statusFilter" size="small">
            <NRadioButton value="all">全部 {{ data.hosts.length }}</NRadioButton>
            <NRadioButton value="up">在线</NRadioButton>
            <NRadioButton value="down">离线</NRadioButton>
            <NRadioButton value="alert">告警 {{ alertHostCount }}</NRadioButton>
          </NRadioGroup>
          <NSelect
            v-model:value="modelFilter"
            :options="modelOptions"
            size="small"
            style="width: 230px"
          />
        </div>

        <div class="card-grid">
          <HostCard v-for="h in filteredHosts" :key="h.hostname" :host="h" @open="openHost" />
        </div>
        <div v-if="!filteredHosts.length" class="no-match">没有匹配的主机</div>
      </template>

      <div v-else-if="!error" class="loading-wrap"><NSpin size="large" /></div>
    </main>
  </div>
</template>

<style scoped>
.filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
  gap: 16px;
}
.no-match {
  text-align: center;
  color: var(--text3);
  padding: 60px 0;
}
@media (max-width: 720px) {
  .card-grid {
    grid-template-columns: 1fr;
  }
}
</style>

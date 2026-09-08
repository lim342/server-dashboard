<script setup lang="ts">
import { computed } from 'vue'
import { NTag } from 'naive-ui'
import type { HostSnapshot } from '@/api/types'
import StatusDot from './StatusDot.vue'
import MetricBar from './MetricBar.vue'
import { fmtW, formatUptime, shortGpuModel, utilColor } from '@/utils/format'

const props = defineProps<{ host: HostSnapshot }>()
const emit = defineEmits<{ (e: 'open', hostname: string): void }>()

const hasCritical = computed(() => props.host.alerts.some((a) => a.level === 'critical'))
const alertCount = computed(() => props.host.alerts.length)

const modelTags = computed(() => {
  const m = new Map<string, number>()
  for (const g of props.host.gpus) m.set(g.model, (m.get(g.model) ?? 0) + 1)
  return [...m.entries()].map(([model, n]) => `${shortGpuModel(model)} ×${n}`)
})

function gpuFill(util: number | null): { width: string; background: string } {
  const v = util ?? 0
  return {
    width: `${Math.min(100, Math.max(v, 1.5))}%`,
    background: utilColor(util),
  }
}
</script>

<template>
  <div
    class="host-card"
    :class="{ offline: !host.nodeUp, crit: hasCritical, warn: !hasCritical && alertCount > 0 }"
    @click="emit('open', host.hostname)"
  >
    <div class="hc-head">
      <StatusDot :ok="host.nodeUp" />
      <span class="hc-name">{{ host.hostname }}</span>
      <NTag v-if="!host.nodeUp" type="error" size="small" :bordered="false">离线</NTag>
      <NTag v-else-if="hasCritical" type="error" size="small" :bordered="false">严重</NTag>
      <NTag v-else-if="alertCount > 0" type="warning" size="small" :bordered="false">
        {{ alertCount }} 项告警
      </NTag>
      <span class="hc-alert-list" :title="host.alerts.map((a) => a.title).join('\n')">
        <template v-if="host.nodeUp && alertCount > 0">
          {{ host.alerts.map((a) => a.title).join(' · ') }}
        </template>
      </span>
    </div>

    <div class="hc-sub">
      <span class="hc-ip">{{ host.ip ?? '—' }}</span>
      <span class="hc-models">
        <span v-for="t in modelTags" :key="t" class="hc-model">{{ t }}</span>
        <span v-if="!host.dcgmUp && host.nodeUp" class="hc-model warn-text">dcgm 离线</span>
      </span>
    </div>

    <div class="hc-metrics">
      <MetricBar label="CPU" :value="host.cpuPercent" unit="%" />
      <MetricBar label="内存" :value="host.memPercent" unit="%" />
      <MetricBar label="GPU 利用率" :value="host.gpuUtilAvg" unit="%" />
      <MetricBar label="GPU 温度" :value="host.gpuTempMax" unit="°C" :max="95" kind="temp" />
    </div>

    <div v-if="host.gpus.length" class="hc-gpus">
      <div v-for="g in host.gpus" :key="g.index" class="hc-gpu">
        <span class="gpu-idx">GPU{{ g.index }}</span>
        <div class="gpu-track"><div class="gpu-fill" :style="gpuFill(g.util)" /></div>
        <span class="gpu-info">
          {{ g.util === null ? '—' : `${Math.round(g.util)}%` }} ·
          {{ g.tempC === null ? '—' : `${Math.round(g.tempC)}°C` }}
        </span>
      </div>
    </div>

    <div class="hc-foot">
      <span>功耗 <b>{{ fmtW(host.gpuPowerW) }}</b></span>
      <span>已运行 <b>{{ formatUptime(host.uptimeSeconds) }}</b></span>
    </div>
  </div>
</template>

<style scoped>
.host-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
  cursor: pointer;
  transition:
    box-shadow 0.15s ease,
    transform 0.15s ease,
    border-color 0.15s ease;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.host-card:hover {
  box-shadow: 0 6px 24px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}
.host-card.warn {
  border-color: #fcd34d;
  background: #fffdf5;
}
.host-card.crit,
.host-card.offline {
  border-color: #fca5a5;
  background: #fff7f7;
}

.hc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.hc-name {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
}
.hc-alert-list {
  color: #b45309;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hc-sub {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--text2);
}
.hc-ip {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.hc-models {
  display: flex;
  gap: 6px;
  overflow: hidden;
  justify-content: flex-end;
}
.hc-model {
  background: #eef4ff;
  color: #3b6fd4;
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 11px;
  white-space: nowrap;
}
.warn-text {
  background: #fef3c7;
  color: #b45309;
}

.hc-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 16px;
}

.hc-gpus {
  display: flex;
  flex-direction: column;
  gap: 5px;
  border-top: 1px dashed var(--border);
  padding-top: 9px;
}
.hc-gpu {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}
.gpu-idx {
  color: var(--text3);
  width: 38px;
  flex: none;
}
.gpu-track {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: #eef1f5;
  overflow: hidden;
}
.gpu-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}
.gpu-info {
  color: var(--text2);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  width: 92px;
  text-align: right;
  flex: none;
}

.hc-foot {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text2);
  border-top: 1px dashed var(--border);
  padding-top: 9px;
}
.hc-foot b {
  color: var(--text);
  font-weight: 600;
}
</style>

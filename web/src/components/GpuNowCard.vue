<script setup lang="ts">
import { computed } from 'vue'
import type { GpuSnapshot } from '@/api/types'
import { fmt, formatMiB, shortGpuModel, tempColor } from '@/utils/format'
import MiniGauge from './MiniGauge.vue'

const props = defineProps<{ gpu: GpuSnapshot }>()

const memPercent = computed<number | null>(() => {
  const { memUsedMiB, memTotalMiB } = props.gpu
  if (memUsedMiB === null || memTotalMiB === null || memTotalMiB <= 0) return null
  return (memUsedMiB / memTotalMiB) * 100
})
</script>

<template>
  <div class="gpu-now-card">
    <div class="gnc-head">
      <span class="gnc-title">GPU{{ gpu.index }}</span>
      <span class="gnc-model">{{ shortGpuModel(gpu.model) }}</span>
    </div>

    <div class="gnc-gauges">
      <div class="gauge-cell">
        <MiniGauge :value="gpu.util" unit="%" />
        <div class="gauge-cap">核心利用率</div>
      </div>
      <div class="gauge-cell">
        <MiniGauge :value="memPercent" unit="%" />
        <div class="gauge-cap">
          {{ formatMiB(gpu.memUsedMiB) }} / {{ formatMiB(gpu.memTotalMiB) }}
        </div>
      </div>
    </div>

    <div class="gnc-rows">
      <div class="gnc-row">
        <span>温度</span>
        <b :style="{ color: tempColor(gpu.tempC) }">
          {{ fmt(gpu.tempC, 0, '°C') }}
          <template v-if="gpu.memTempC !== null"> / {{ gpu.memTempC.toFixed(0) }}°C</template>
        </b>
      </div>
      <div class="gnc-row">
        <span>功耗</span><b>{{ fmt(gpu.powerW, 1, ' W') }}</b>
      </div>
      <div class="gnc-row">
        <span>SM / 显存频率</span>
        <b>{{ fmt(gpu.smClockMHz, 0) }} / {{ fmt(gpu.memClockMHz, 0) }} MHz</b>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gpu-now-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.gnc-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.gnc-title {
  font-weight: 650;
  font-size: 14px;
}
.gnc-model {
  font-size: 11px;
  background: #eef4ff;
  color: #3b6fd4;
  border-radius: 4px;
  padding: 1px 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gnc-gauges {
  display: flex;
  justify-content: space-around;
  gap: 8px;
}
.gauge-cell {
  flex: 1 1 0;
  max-width: 170px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
}
.gauge-cap {
  font-size: 11px;
  color: var(--text2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 130px;
}
.gnc-rows {
  display: flex;
  flex-direction: column;
  gap: 7px;
  border-top: 1px dashed var(--border);
  padding-top: 9px;
}
.gnc-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 12px;
  color: var(--text2);
}
.gnc-row b {
  color: var(--text);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
import { NTag } from 'naive-ui'
import type { GpuSnapshot } from '@/api/types'
import { fmt, formatMiB, formatUptime, shortGpuModel, tempColor } from '@/utils/format'
import MiniGauge from './MiniGauge.vue'

const props = defineProps<{ gpu: GpuSnapshot }>()

const memPercent = computed<number | null>(() => {
  const { memUsedMiB, memTotalMiB } = props.gpu
  if (memUsedMiB === null || memTotalMiB === null || memTotalMiB <= 0) return null
  return (memUsedMiB / memTotalMiB) * 100
})

// 值随 /api 数据轮询刷新(约 30s),足以展示"失联多久"
const missingFor = computed(() =>
  props.gpu.lastSeenMs !== null ? formatUptime((Date.now() - props.gpu.lastSeenMs) / 1000) : '—',
)

// 失联占位分两种:单卡掉线(红色,采集器在线但该卡无数据)与
// DCGM 采集器整机离线(黄色,该卡状态实为未知,不应渲染成掉卡)
const collectorDown = computed(() => !props.gpu.present && props.gpu.missingKind === 'collector')
</script>

<template>
  <div
    class="gpu-now-card"
    :class="{ missing: !gpu.present && !collectorDown, nodata: collectorDown }"
  >
    <div class="gnc-head">
      <span class="gnc-title">GPU{{ gpu.index }}</span>
      <NTag
        v-if="!gpu.present"
        :type="collectorDown ? 'warning' : 'error'"
        size="small"
        :bordered="false"
      >
        {{ collectorDown ? '采集器离线' : '掉线' }}
      </NTag>
      <span class="gnc-model">{{ shortGpuModel(gpu.model) || '未知型号' }}</span>
    </div>

    <div v-if="!gpu.present" class="gnc-missing">
      <div class="gm-title">{{ collectorDown ? '状态未知' : '无数据' }}</div>
      <div v-if="collectorDown" class="gm-sub">DCGM 采集器离线,无法获取 GPU 数据</div>
      <div v-else-if="gpu.lastSeenMs !== null" class="gm-sub">
        最后上报于 {{ missingFor }} 前 · 请检查显卡/驱动状态
      </div>
      <div v-else class="gm-sub">近期无上报记录 · 请检查显卡/驱动状态</div>
    </div>

    <template v-else>
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
    </template>
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
.gpu-now-card.missing {
  border-color: #fca5a5;
  background: #fff7f7;
}
.gpu-now-card.nodata {
  border-color: #fcd34d;
  background: #fffdf5;
}
.gnc-missing {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 130px;
  border-top: 1px dashed var(--border);
  padding-top: 10px;
}
.gm-title {
  font-size: 15px;
  font-weight: 650;
  color: #dc2626;
}
.gpu-now-card.nodata .gm-title {
  color: #b45309;
}
.gm-sub {
  font-size: 11px;
  color: var(--text2);
  text-align: center;
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

<script setup lang="ts">
import { computed } from 'vue'
import { tempColor, utilColor } from '@/utils/format'

const props = withDefaults(
  defineProps<{
    label: string
    value: number | null | undefined
    unit?: string
    max?: number
    kind?: 'util' | 'temp'
  }>(),
  { unit: '', max: 100, kind: 'util' },
)

const pct = computed(() => {
  if (props.value === null || props.value === undefined || !Number.isFinite(props.value)) return 0
  return Math.min(100, Math.max(2, (props.value / props.max) * 100))
})

const color = computed(() =>
  props.kind === 'temp' ? tempColor(props.value) : utilColor(props.value),
)

const text = computed(() => {
  if (props.value === null || props.value === undefined || !Number.isFinite(props.value)) return '—'
  return `${props.value.toFixed(props.value < 10 ? 1 : 0)}${props.unit}`
})
</script>

<template>
  <div class="metric-bar">
    <div class="mb-head">
      <span class="mb-label">{{ label }}</span>
      <span class="mb-value" :style="{ color }">{{ text }}</span>
    </div>
    <div class="mb-track">
      <div class="mb-fill" :style="{ width: `${pct}%`, background: color }" />
    </div>
  </div>
</template>

<style scoped>
.metric-bar {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.mb-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 12px;
}
.mb-label {
  color: var(--text2);
}
.mb-value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.mb-track {
  height: 5px;
  border-radius: 3px;
  background: #eef1f5;
  overflow: hidden;
}
.mb-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}
</style>

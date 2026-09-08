<script setup lang="ts">
import { computed } from 'vue'
import type { ChartOption } from '@/lib/echarts'
import { gaugeOption } from '@/lib/chart'
import MetricChart from './MetricChart.vue'

const props = withDefaults(
  defineProps<{
    value: number | null
    max?: number
    unit?: string
  }>(),
  { max: 100, unit: '%' },
)

const option = computed<ChartOption>(() =>
  gaugeOption(props.value, { max: props.max, unit: props.unit }),
)
</script>

<template>
  <MetricChart :option="option" height="116px" />
</template>

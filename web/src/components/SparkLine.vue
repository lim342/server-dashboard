<script setup lang="ts">
import { computed } from 'vue'
import type { Series } from '@/api/types'
import { sparkOption } from '@/lib/chart'
import MetricChart from './MetricChart.vue'

const props = defineProps<{ series: Series | undefined; color?: string }>()

const option = computed(() => sparkOption(props.series, props.color ?? '#3b82f6'))
</script>

<template>
  <MetricChart :option="option" height="44px" />
</template>

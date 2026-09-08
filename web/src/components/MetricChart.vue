<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import echarts, { type ChartInstance, type ChartOption } from '@/lib/echarts'

const props = defineProps<{ option: ChartOption; height?: string }>()

const el = ref<HTMLDivElement>()
let chart: ChartInstance | null = null
let observer: ResizeObserver | null = null

onMounted(() => {
  if (!el.value) return
  chart = echarts.init(el.value)
  chart.setOption(props.option)
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(el.value)
})

watch(
  () => props.option,
  (opt) => chart?.setOption(opt, true),
)

onBeforeUnmount(() => {
  observer?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div ref="el" :style="{ height: height ?? '260px', width: '100%' }" />
</template>

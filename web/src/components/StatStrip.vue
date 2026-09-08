<script setup lang="ts">
import type { ClusterSummary, TrendSeries } from '@/api/types'
import SparkLine from './SparkLine.vue'
import { fmt, fmtW, formatBytes, formatMiB } from '@/utils/format'

defineProps<{
  cluster: ClusterSummary
  trends: { cpu: TrendSeries; mem: TrendSeries; gpuUtil: TrendSeries }
}>()
</script>

<template>
  <div class="stat-strip">
    <div class="stat-tile">
      <div class="st-label">服务器</div>
      <div class="st-value" :class="{ bad: cluster.hostsUp < cluster.hostsTotal }">
        {{ cluster.hostsUp }}<span class="st-total"> / {{ cluster.hostsTotal }}</span>
      </div>
      <div class="st-sub">在线 / 总数</div>
    </div>

    <div class="stat-tile">
      <div class="st-label">GPU</div>
      <div class="st-value" :class="{ bad: cluster.gpusUp < cluster.gpusTotal }">
        {{ cluster.gpusUp }}<span class="st-total"> / {{ cluster.gpusTotal }}</span>
      </div>
      <div class="st-sub">在线 / 总数</div>
    </div>

    <div class="stat-tile">
      <div class="st-label">集群 CPU</div>
      <div class="st-value">{{ fmt(cluster.cpuPercent, 1, '%') }}</div>
      <SparkLine :series="trends.cpu" color="#3b82f6" />
    </div>

    <div class="stat-tile">
      <div class="st-label">集群内存</div>
      <div class="st-value">{{ fmt(cluster.memPercent, 1, '%') }}</div>
      <div class="st-sub2">
        {{ formatBytes(cluster.memUsedBytes, 0) }} / {{ formatBytes(cluster.memTotalBytes, 1) }} 总量
      </div>
      <SparkLine :series="trends.mem" color="#8b5cf6" />
    </div>

    <div class="stat-tile">
      <div class="st-label">GPU 平均利用率</div>
      <div class="st-value">{{ fmt(cluster.gpuUtilAvg, 1, '%') }}</div>
      <SparkLine :series="trends.gpuUtil" color="#10b981" />
    </div>

    <div class="stat-tile">
      <div class="st-label">GPU 显存</div>
      <div class="st-value sm">{{ formatMiB(cluster.gpuMemUsedMiB, 1) }}</div>
      <div class="st-sub">/ {{ formatMiB(cluster.gpuMemTotalMiB, 1) }}</div>
    </div>

    <div class="stat-tile">
      <div class="st-label">GPU 总功耗</div>
      <div class="st-value">{{ fmtW(cluster.gpuPowerW) }}</div>
      <div class="st-sub">{{ cluster.gpusTotal }} 张卡</div>
    </div>

    <div class="stat-tile">
      <div class="st-label">GPU 最高温度</div>
      <div class="st-value">{{ fmt(cluster.gpuTempMax, 0, '°C') }}</div>
      <div class="st-sub">{{ cluster.hottestGpuHost ? `@ ${cluster.hottestGpuHost}` : '' }}</div>
    </div>
  </div>
</template>

<style scoped>
.stat-strip {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}
.stat-tile {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.st-label {
  font-size: 12px;
  color: var(--text2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.st-value {
  font-size: 22px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  white-space: nowrap;
}
.st-value.sm {
  font-size: 17px;
  padding-top: 3px;
}
.st-value.bad {
  color: var(--red);
}
.st-total {
  font-size: 14px;
  color: var(--text3);
  font-weight: 500;
}
.st-inline {
  font-size: 12px;
  color: var(--text3);
  font-weight: 500;
  margin-left: 4px;
}
.st-sub2 {
  font-size: 11px;
  color: var(--text3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.st-sub {
  font-size: 11px;
  color: var(--text3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  height: 14px;
}

@media (max-width: 1400px) {
  .stat-strip {
    grid-template-columns: repeat(4, 1fr);
  }
}
@media (max-width: 720px) {
  .stat-strip {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>

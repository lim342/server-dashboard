<script setup lang="ts">
withDefaults(defineProps<{ ok: boolean; size?: number }>(), { size: 8 })
</script>

<template>
  <span
    class="status-dot"
    :class="ok ? 'ok' : 'down'"
    :style="{ width: `${size}px`, height: `${size}px` }"
  />
</template>

<style scoped>
.status-dot {
  border-radius: 50%;
  display: inline-block;
  flex: none;
}
.ok {
  background: var(--green);
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
}
.down {
  background: var(--red);
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15);
}
</style>

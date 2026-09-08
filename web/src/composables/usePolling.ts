import { onUnmounted, watch } from 'vue'

/**
 * 轮询:间隔由 getter 返回,返回 <=0 表示暂停。
 * 页面隐藏(切到后台标签)时跳过触发,避免无谓请求。
 */
export function usePolling(fn: () => unknown, getIntervalMs: () => number) {
  let timer: ReturnType<typeof setInterval> | undefined

  const stop = () => {
    if (timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }

  const restart = () => {
    stop()
    const ms = getIntervalMs()
    if (ms > 0) {
      timer = setInterval(() => {
        if (!document.hidden) fn()
      }, ms)
    }
  }

  watch(getIntervalMs, restart, { immediate: true })
  onUnmounted(stop)
}

// Express 路由

import { Router } from 'express'
import { cached, PrometheusError, prometheusVersion, PROM_URL } from './prometheus.js'
import { collectOverview } from './snapshot.js'
import { collectHostHistory, type HistoryWindow } from './history.js'
import { CUSTOM_RANGE_LIMITS, RANGES } from './queries.js'

export const router = Router()

function errResponse(res: { status: (code: number) => { json: (b: unknown) => void } }, e: unknown) {
  if (e instanceof PrometheusError) {
    res.status(502).json({ error: e.message })
  } else {
    res.status(500).json({ error: (e as Error)?.message ?? '服务器内部错误' })
  }
}

router.get('/api/health', async (_req, res) => {
  const version = await prometheusVersion()
  res.json({
    ok: true,
    prometheus: { url: PROM_URL, reachable: version !== null, version },
  })
})

router.get('/api/overview', async (_req, res) => {
  try {
    const data = await cached('overview', 5_000, collectOverview)
    res.json(data)
  } catch (e) {
    errResponse(res, e)
  }
})

router.get('/api/hosts/:hostname', async (req, res) => {
  try {
    const data = await cached('overview', 5_000, collectOverview)
    const host = data.hosts.find((h) => h.hostname === req.params.hostname)
    if (!host) {
      res.status(404).json({ error: `未找到主机 ${req.params.hostname}` })
      return
    }
    res.json(host)
  } catch (e) {
    errResponse(res, e)
  }
})

router.get('/api/hosts/:hostname/history', async (req, res) => {
  const hostname = req.params.hostname
  const { start, end, range } = req.query

  let window: HistoryWindow
  let cacheKey: string

  if (start !== undefined || end !== undefined) {
    // 自定义窗口:start/end 为毫秒时间戳
    const startMs = Number(start)
    const endMs = Number(end)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      res.status(400).json({ error: '自定义时间范围需要有效的 start/end 毫秒时间戳' })
      return
    }
    const nowS = Math.floor(Date.now() / 1000)
    const endS = Math.min(Math.floor(endMs / 1000), nowS) // 不允许查询未来
    const startS = Math.floor(startMs / 1000)
    const span = endS - startS
    if (span < CUSTOM_RANGE_LIMITS.minSec) {
      res.status(400).json({ error: `时间范围过短,至少 ${CUSTOM_RANGE_LIMITS.minSec / 60} 分钟` })
      return
    }
    if (span > CUSTOM_RANGE_LIMITS.maxSec) {
      res.status(400).json({ error: '时间范围过长,最多 31 天' })
      return
    }
    window = { startS, endS }
    cacheKey = `history:${hostname}:custom:${startS}:${endS}`
  } else {
    const r = typeof range === 'string' && RANGES[range] ? range : '1h'
    window = { range: r }
    cacheKey = `history:${hostname}:${r}`
  }

  try {
    const data = await cached(cacheKey, 15_000, () => collectHostHistory(hostname, window))
    res.json(data)
  } catch (e) {
    errResponse(res, e)
  }
})

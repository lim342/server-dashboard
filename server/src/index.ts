// 服务入口:API + 生产模式托管前端静态文件

import express from 'express'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { router } from './routes.js'
import { prometheusVersion } from './prometheus.js'
import { HOST, PORT, PROM_URL } from './config.js'
const app = express()

app.use(router)

// 生产模式:托管 web/dist(与 server/ 平级)
const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url))
app.use(express.static(webDist))
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(webDist, 'index.html'))
})

app.listen(PORT, HOST, () => {
  const shownHost = HOST === '0.0.0.0' ? 'localhost' : HOST
  console.log(`[server-dashboard] http://${shownHost}:${PORT} (${HOST === '0.0.0.0' ? '局域网可访问' : '仅本机访问'})`)
  console.log(`[server-dashboard] Prometheus: ${PROM_URL}`)
  prometheusVersion().then((v) => {
    if (v) console.log(`[server-dashboard] Prometheus 连接正常 (v${v})`)
    else console.warn(`[server-dashboard] ⚠ 无法连接 Prometheus,请检查 PROM_URL=${PROM_URL}`)
  })
})

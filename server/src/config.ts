// 配置加载:优先级 = 进程环境变量 > .env 文件 > 代码默认值
// (Node 的 loadEnvFile 不会覆盖已存在的环境变量)
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const serverEnv = fileURLToPath(new URL('../.env', import.meta.url))
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url))

for (const p of [serverEnv, rootEnv]) {
  if (existsSync(p)) {
    try {
      process.loadEnvFile(p)
    } catch {
      // .env 解析失败时忽略,继续用环境变量/默认值
    }
    break
  }
}

/** Prometheus 地址(与 Prometheus 同机部署时保持 localhost 默认即可) */
export const PROM_URL = process.env.PROM_URL ?? 'http://localhost:9090'

/** 后端监听端口 */
export const PORT = Number(process.env.PORT ?? 3210)

/** 后端监听地址:0.0.0.0 = 局域网可访问;仅本机访问设为 127.0.0.1 */
export const HOST = process.env.HOST ?? '0.0.0.0'

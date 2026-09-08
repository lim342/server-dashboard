# server-dashboard

GPU 服务器监控面板:基于 Prometheus(node_exporter + dcgm-exporter)的轻量自建监控页面。

- **主页**:集群总览统计条 + 服务器卡片墙(响应式一行多卡),支持搜索(主机名 / IP / GPU 型号)、状态筛选(在线 / 离线 / 告警)、GPU 型号筛选,默认每 15 秒自动刷新
- **详情页** `/host/:hostname`:CPU / 负载 / 内存 / 磁盘 / 网络时序图表,逐 GPU 当前状态卡与历史曲线(利用率、显存、温度、功耗、频率),时间范围 1h / 6h / 24h / 7d + **自定义日期时间区间**(同一天选择按整天 00:00~23:59:59 理解;也支持 `/host/:hostname?start=ms&end=ms` 直接打开指定时段,可分享链接)
- **告警高亮**:节点离线、CPU / 内存 / 磁盘 >90%、GPU 温度 >85°C、显存 >95% 时卡片描边 + 徽标(阈值在 `server/src/queries.ts` 中调整)

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Vue 3 + TypeScript + Vite + Naive UI + ECharts |
| 后端 | Node.js + Express + TypeScript(聚合代理层,无数据库) |
| 数据源 | Prometheus HTTP API(`node` 与 `dcgm` 两个 job) |

后端把一次页面刷新所需的十几条 PromQL 并行查询归一化为一个 JSON,自带 5 秒内存缓存,并彻底规避浏览器跨域问题。

## 开发

```bash
npm install
npm run dev        # 同时启动:后端 :3210(tsx watch)+ 前端 :5173(vite,已配 /api 代理)
```

## 生产部署

```bash
npm run build      # 构建前端(web/dist)+ 编译后端(server/dist)
npm run start      # 单端口 :3210,后端同时托管前端静态文件
```

## 配置

复制 `server/.env.example` 为 `server/.env` 按需修改(优先级:**环境变量 > .env 文件 > 代码默认值**;`.env` 已被 gitignore):

```bash
cp server/.env.example server/.env
```

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PROM_URL` | `http://localhost:9090` | Prometheus 地址;面板与 Prometheus 同机部署时保持默认即可,远端部署改成对应地址 |
| `PORT` | `3210` | 后端监听端口 |
| `HOST` | `0.0.0.0` | 监听地址;`0.0.0.0` 局域网可访问,仅本机访问改为 `127.0.0.1` |

示例:`PROM_URL=http://10.0.0.1:9090 PORT=8080 npm run start`

## API

| 路径 | 说明 |
|---|---|
| `GET /api/overview` | 集群统计 + 全部主机快照 + 1h 趋势(5s 缓存) |
| `GET /api/hosts/:hostname` | 单主机快照(含磁盘、逐 GPU 当前值) |
| `GET /api/hosts/:hostname/history?range=1h\|6h\|24h\|7d` | 详情页全部时序序列 |
| `GET /api/hosts/:hostname/history?start=ms&end=ms` | 自定义时间窗(10 分钟 ~ 31 天,采样步长自动计算,end 不超过当前时间) |
| `GET /api/health` | 后端与 Prometheus 连通性 |

## 目录结构

```
server/   后端:prometheus.ts(客户端+缓存) queries.ts(PromQL/阈值) snapshot.ts(聚合) history.ts(时序) routes.ts
web/      前端:views/(主页+详情页) components/(卡片/统计条/图表) lib/(ECharts 封装) api/ composables/
```

## 已知事项

- **Prometheus 端点暴露在公网 IP 且无认证**,任何人都能读取全部指标(含内网拓扑)。建议给 Prometheus 加 basic auth / 反代认证,或用防火墙限制来源,然后把 `PROM_URL` 指向安全入口。
- 网络流量图自动过滤容器/虚拟网卡(docker、cni、flannel、kube-ipvs、tailscale 等),只显示物理网卡;如需调整过滤规则见 `server/src/queries.ts` 中的 `NET_DEV_FILTER`。

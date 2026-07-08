---
docType: operations-runbook
scope: repo
status: active
authoritative: true
owner: identity-center
language: zh
whenToUse: 需要从零启动、部署、验证或巡检统一身份平台运行环境时阅读本文档。
whenToUpdate: compose 端口、环境变量、启动步骤、生产部署要求或运维验证步骤变化时更新本文档。
checkPaths:
  - identity-portal/deploy/runbooks/README.md
  - identity-portal/deploy/docker/**
  - identity-portal/deploy/runbooks/**
lastReviewedAt: 2026-07-08
lastReviewedCommit: 0106728
---

# 统一身份平台 · 部署/启动/运行 Runbook

> 从零到运行的完整操作手册。专项手册:[部署](./deployment.md) · [回滚](./rollback.md) · [Secret 轮换](./keycloak-client-secret-rotation.md) · [备份恢复](./database-backup-restore.md) · [故障响应](./incident-response.md) · [监控告警](../monitoring/alerts.md) · [业务应用接入](../../../docs/guides/business-app-onboarding.md)

---

## 0. 环境要求

| 依赖 | 版本 | 说明 |
|---|---|---|
| Docker + Compose | Docker 24+ / Compose v2 | 全部基础设施容器化 |
| Node.js | ≥ 20(开发机 22/24 均可) | Next.js 16 要求 |
| pnpm | 10.x | `corepack enable` 即可 |
| PostgreSQL client(可选) | 17 | 备份/恢复脚本用 `pg_dump/pg_restore` |

服务与端口约定:

| 服务 | 端口 | 用途 |
|---|---|---|
| Portal(Next.js) | 3000 | 门户 + 管理后台 + API |
| Keycloak | 8080(管理探针 127.0.0.1:19000 dev only) | 统一身份中心,realm `company-dev`;容器内管理探针仍为 9000 |
| PostgreSQL | 127.0.0.1:15432(dev only) | 库 `identity_platform`(用户 identity)+ `keycloak`(用户 keycloak);容器内仍为 5432 |
| Redis | 127.0.0.1:16379(dev only) | BullMQ 任务队列 + 速率限制;容器内仍为 6379;生产不发布宿主机端口 |
| RabbitMQ | 5672(UI 15672,identity/identity) | 事件分发(exchange `identity.events`) |
| Mailpit(仅 dev,可选) | SMTP 11025 / UI 8025 | 开发邮件收件箱(默认不启用邮件验证,仅 `KC_VERIFY_EMAIL=true` 时需要);容器内 SMTP 仍为 1025 |
| KingbaseES(可选 profile `kes`) | 127.0.0.1:15433(dev only) | 双库兼容验证(D-001);容器内仍为 54321 |

---

## 1. 开发环境:从零启动

全部命令在 `identity-portal/` 下执行。

```bash
# 1) 起基础设施(五服务,含健康等待)
docker compose -f deploy/docker/docker-compose.dev.yml up -d --wait

# 2) 引导 Keycloak(幂等):realm/clients/角色/策略/双语/登录主题,并导出配置留档
#    邮箱验证默认关闭(无需 SMTP);如需开启:KC_VERIFY_EMAIL=true + KC_SMTP_HOST=localhost + KC_SMTP_PORT=11025 后重跑本步
pnpm bootstrap:keycloak
pnpm bootstrap:keycloak -- --export     # 产物: deploy/keycloak/realm-company-dev.json

# 3) 准备 .env
cp deploy/env/.env.example .env
#    a. 生成会话密钥
echo "AUTH_SECRET=$(openssl rand -base64 32)" >> .env
#    b. 读取两个 client secret 并粘贴进 .env(输出即 env 行)
pnpm tsx scripts/print-client-secret.ts
#    c. Redis dev 默认口令由 compose 注入为 identity-dev-redis
#       .env 中 DATABASE_URL 应为 postgres://identity:identity@localhost:15432/identity_platform
#       .env 中 REDIS_URL 应为 redis://:identity-dev-redis@localhost:16379
#    d. 校验
pnpm check-env

# 4) 数据库迁移 + 种子(内置角色/权限、种子管理员、业务应用目录;均幂等)
pnpm db:migrate
pnpm db:seed

# 5) 启动应用与后台任务(两个终端)
pnpm dev        # Portal http://localhost:3000
pnpm worker     # BullMQ 定时任务 + MQ 事件消费
```

**启动后验证清单:**

```bash
curl -s http://localhost:3000/api/health   # 期望 {"data":{"status":"up",...}}
```
- 浏览器打开 http://localhost:3000 → 登录 → Keycloak 登录页(identity 主题,中文)
- 种子管理员:`admin@identity.local` / `Identity-Admin-2026`(临时密码,首登强制改密)
- 登录后应见「管理后台访问已授权」,可进入 `/admin` 概览

**测试口径:**

```bash
pnpm test               # 单元测试
pnpm test:integration   # 集成测试(需 compose 环境在跑)
pnpm test:e2e           # Playwright(自动起 dev server;需已完成上面 1-4 步)
KES_ENABLED=1 pnpm test:integration   # KES 双库补验(需 profile kes 环境,见 §5)
```

---

## 2. 生产部署:首次上线

前置:一台 Docker 主机;HTTPS 由外层反代(Nginx/Caddy)终止并转发 `X-Forwarded-Proto/Host` 到 portal:3000。

```bash
# 1) 准备生产环境变量(参考 .env.example 全量填写;严禁复用 dev 默认口令)
vi deploy/env/.env.production
#   必填:DATABASE_URL、POSTGRES_USER/PASSWORD、KC_DB_* 、KC_BOOTSTRAP_ADMIN_*、
#        AUTH_SECRET、KEYCLOAK_BASE_URL(公网 https)、KEYCLOAK_CLIENT_SECRET、
#        KEYCLOAK_ADMIN_API_CLIENT_SECRET、REDIS_PASSWORD、REDIS_URL、RABBITMQ_URL、
#        PII_ENCRYPTION_KEY(openssl rand -base64 32)、
#        (可选)KC_VERIFY_EMAIL=true + KC_SMTP_HOST/KC_SMTP_PORT(启用邮箱验证时)、
#        CAPTCHA_PROVIDER/CAPTCHA_SECRET(启用人机验证)、各业务应用 Webhook secret
#        REDIS_PASSWORD 用 openssl rand -base64 32 生成;REDIS_URL 使用
#        redis://:<REDIS_PASSWORD>@redis:6379,不要把 Redis 发布到公网。

# 2) 起基础设施
docker compose -f deploy/docker/docker-compose.prod.yml up -d postgres keycloak redis rabbitmq --wait

# 3) Keycloak 引导 + 导出留档(读 .env.production 的 KEYCLOAK_* 变量执行)
pnpm bootstrap:keycloak && pnpm bootstrap:keycloak -- --export
pnpm tsx scripts/print-client-secret.ts    # 回填两个 secret 到 .env.production

# 4) 迁移 + 种子
pnpm db:migrate && pnpm db:seed

# 5) 构建并启动应用(portal=standalone 镜像,worker=任务镜像)
docker compose -f deploy/docker/docker-compose.prod.yml up -d --build portal worker --wait

# 6) 验证
curl -s https://<域名>/api/health          # status=up
#   登录冒烟:种子管理员登录 → /admin 概览 → 审计页有记录
```

升级发布与回滚:见 [deployment.md](./deployment.md) §升级发布、[rollback.md](./rollback.md)(原则:优先前滚,不回退 schema)。

---

## 3. 日常运行

### 3.1 后台任务(worker 承载,间隔可经 env 覆盖)

| 任务 | 默认间隔 | 职责 |
|---|---|---|
| dispatch-outbox-events | 5s | outbox → RabbitMQ 派发(失败 5 次进死信) |
| deliver-webhooks | 10s | 签名投递业务应用(退避 1s/5s/30s/2m/10m,5 败进死信) |
| project-keycloak-assignments | 60s | 准入投影重试(pending/failed → Keycloak Client Role) |
| retry-dead-letter-events | 5min | 死信重放(outbox 重发 / webhook 重置待投) |
| reconcile-keycloak-users | 1h | 用户状态对账(以平台事实修 KC) |
| reconcile-application-projections | 1h | 准入投影对账(补齐/移除漂移) |

MQ 事件消费(`identity.webhook-fanout` 队列)随 worker 常驻。

### 3.2 例行运维

| 周期 | 动作 | 参考 |
|---|---|---|
| 每日 | 平台库备份(cron 调 `scripts/backup-db.sh`);巡检 `/api/health` 与告警指标 | [备份恢复](./database-backup-restore.md) / [告警基线](../monitoring/alerts.md) |
| 每周 | Keycloak realm 导出入库(`bootstrap:keycloak -- --export` 后提交) | — |
| 每月/季度 | 恢复演练(RTO 30min 达标记录);client secret 轮换(≤90 天) | [备份恢复](./database-backup-restore.md) / [Secret 轮换](./keycloak-client-secret-rotation.md) |

### 3.3 快速巡检 SQL

```sql
SELECT status, count(*) FROM outbox_events GROUP BY status;                       -- 积压(pending>1000 告警)
SELECT count(*) FROM dead_letter_events WHERE resolved_at IS NULL;                 -- 未处理死信
SELECT count(*) FROM application_assignments WHERE projection_status='failed';     -- 投影失败(>0 持续告警)
```

---

## 4. 常见故障速查

| 症状 | 首查 | 处置 |
|---|---|---|
| 新登录 503 / 管理写操作 503 | Keycloak 容器与 `/health/ready` | 降级策略生效中;恢复 KC 后跑两个 reconcile 任务;详见 [故障响应](./incident-response.md) |
| outbox pending 积压 | RabbitMQ 状态、worker 日志 | 恢复 MQ 后 dispatch 自动补发;死信用 retry 任务重放 |
| webhook status=dead | 业务端点可达性、`last_error` | 修复端点 → 死信重放自动重投 |
| 撤权 API 返回 502 | `application_assignments.last_projection_error` | 事实已 revoked;投影由重试任务补;持续失败查 KC 连通 |
| 登录页非品牌主题 | keycloak 容器 themes 挂载 | 确认 `deploy/keycloak/themes` volume 与 realm loginTheme=identity |
| 紧急管理通道 | — | `break_glass_admin`(仅初始化/修复;用后改密+审计),见 [故障响应](./incident-response.md) |

---

## 5. KingbaseES 双库验证(D-001,按需)

```bash
docker compose --profile kes -f deploy/docker/docker-compose.dev.yml up -d kingbase
# 首次:容器内创建 identity 用户与 identity_platform 库(镜像口径见 docs/references/kingbasees-environment.md)
KES_ENABLED=1 KINGBASE_ADMIN_URL=postgres://kingbase:kingbase@localhost:15433/test pnpm test:integration
```

当前状态:开发机(arm64)无可用 KES 镜像,兼容三件套(约定/adapter/矩阵)已就绪,详见 [kingbasees-environment.md](../../../docs/references/kingbasees-environment.md)。

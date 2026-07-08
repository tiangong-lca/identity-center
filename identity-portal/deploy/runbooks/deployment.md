# Runbook:部署

## 前置
- 配置 `deploy/env/.env.production`(参考 `.env.example`;AUTH_SECRET、DB/Keycloak/Redis/RabbitMQ 口令、KEYCLOAK_CLIENT_SECRET、KEYCLOAK_ADMIN_API_CLIENT_SECRET、PII_ENCRYPTION_KEY、各 Webhook secret)。Redis 必须设置 `REDIS_PASSWORD`，且 `REDIS_URL` 使用 `redis://:<REDIS_PASSWORD>@redis:6379`。
- HTTPS 由外层反代(Nginx/Caddy)终止,转发到 portal:3000,设置 `X-Forwarded-Proto/Host`。

## 首次部署
1. `docker compose -f deploy/docker/docker-compose.prod.yml up -d postgres keycloak redis rabbitmq --wait`
2. Keycloak 引导:`pnpm bootstrap:keycloak && pnpm bootstrap:keycloak -- --export`(导出留档)。
3. 取 client secret 写入 .env.production:`pnpm tsx scripts/print-client-secret.ts`。
4. 数据库迁移:`pnpm db:migrate`。
5. 种子:`pnpm db:seed`(内置角色/权限 + 种子管理员 + 业务应用目录)。
6. 起应用:`docker compose -f deploy/docker/docker-compose.prod.yml up -d portal worker --wait`。
7. 验证:`curl https://<域名>/api/health` 返回 status=up;管理员登录门户。

## 升级发布
1. 备份(见 database-backup-restore.md)。
2. 拉取新代码 → `docker compose ... build portal worker`。
3. `db:migrate`(向前兼容迁移)。
4. 滚动重启:`docker compose ... up -d portal worker`。
5. 健康检查 + 冒烟(登录、用户列表、审计)。失败见 rollback.md。

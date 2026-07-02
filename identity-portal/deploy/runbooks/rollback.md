# Runbook:回滚

## 触发条件
健康检查失败、关键流程(登录/准入/审计)冒烟不通过、错误率突增。

## 应用回滚(无 schema 变更)
1. `docker compose -f deploy/docker/docker-compose.prod.yml up -d portal worker`(切回上一镜像 tag)。
2. 健康检查 + 冒烟确认。

## 含迁移的回滚
Drizzle 无 down 迁移(见兼容约定),原则:**优先前滚修复,不回退 schema**。
1. 若新迁移导致故障:发布 hotfix 迁移修正(向前)。
2. 数据损坏时才从备份恢复(见 database-backup-restore.md),接受 RPO 内数据丢失。

## Keycloak 配置回滚
用最近导出的 `deploy/keycloak/realm-company-dev.json`:partial import 覆盖 realm 配置(用户数据不动)。

## 事后
记录 incident(见 incident-response.md),补对账:`reconcile-keycloak-users` / `reconcile-application-projections`。

# Runbook:故障响应

## 分级
- P1:身份服务(Keycloak)不可用、门户不可登录、数据泄露风险。
- P2:同步管道积压、Webhook 大面积失败、单业务应用准入异常。
- P3:单用户问题、非关键功能降级。

## Keycloak 不可用(P1)
降级策略(安全设计 §15.1)自动生效:已持有 token 继续可用;新登录 503;管理写操作 503(`assertKeycloakAvailableForWrite`);准入缓存仅拒绝不放行。
1. 确认 Keycloak 容器/DB 状态,恢复服务。
2. 恢复后触发全量对账:`reconcile-keycloak-users`、`reconcile-application-projections`。
3. 审计降级期间的拒绝事件。

## break_glass 应急
Keycloak 或本地 RBAC 损坏时,用 `break_glass_admin` 账号(realm role)登录初始化/修复。使用后:改密、审计留痕、通知负责人。

## 同步管道积压(P2)
1. 查 `outbox_events` status=pending/failed 计数、`dead_letter_events` 增长、RabbitMQ 队列深度。
2. MQ 故障:恢复 RabbitMQ → `dispatch-outbox-events` 自动补发 → `retry-dead-letter-events` 重放死信。
3. Webhook 失败:查 `webhook_deliveries` status=dead + lastError;修复端点后死信重放。

## 准入撤销投影失败
撤权 API 返回 502 时:事实已 revoked,`project-keycloak-assignments` 每分钟重投;持续失败查 `application_assignments.last_projection_error` + 告警。

## 事后
记录时间线、影响面、根因、修复与预防项;更新监控阈值。

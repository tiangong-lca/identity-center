# 监控告警基线

数据源:`/api/health`(DB/Redis 探针)、平台库事件表查询、Keycloak 事件、应用日志。

## 告警规则(部署与运维设计)

| 层级 | 指标 | 阈值 | 处理 |
|---|---|---|---|
| 同步 | `outbox_events` status=pending 积压 | > 1000 | 查 dispatch 任务/MQ 连通性 |
| 同步 | `dead_letter_events` 新增 | 持续增长 | incident-response 死信处理 |
| 同步 | Webhook 失败率(`webhook_deliveries` dead/total) | > 1% | 查业务端点 |
| 同步 | 准入投影失败(`application_assignments` projection_status=failed) | > 0 持续 | 查 Keycloak/重投影任务 |
| 认证 | 登录失败率(Keycloak 事件) | > 5% | 查暴力破解/配置 |
| 认证 | Keycloak Admin API 错误率 | > 0.1% | 查 service account/网络 |
| 基础 | DB 连接失败 / `/api/health` degraded | 任意 | 立即告警 |
| 基础 | 证书临期 | < 14 天 | 续期 |
| 基础 | secret 轮换失败 | 任意 | 立即告警 |

## 巡检查询(示例)
```sql
-- outbox 积压
SELECT status, count(*) FROM outbox_events GROUP BY status;
-- 死信近 1h
SELECT source, count(*) FROM dead_letter_events WHERE created_at > now() - interval '1 hour' GROUP BY source;
-- 投影失败
SELECT count(*) FROM application_assignments WHERE projection_status = 'failed';
```

## 接入
指标可由 Prometheus exporter 抓取 `/api/health` 与定时 SQL 巡检导出;告警经 Alertmanager/邮件。首版提供规则与查询,exporter 接线随生产监控栈落地。

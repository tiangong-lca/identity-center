# 统一身份平台待讨论设计问题

> 仅记录尚未固化的设计问题。已确认的目标态决议见 `2026-06-26-confirmed-design-decisions.md`。

## 1. 已同步到正式文档的确认项

以下问题已确认并同步到正式设计文档，不再作为待讨论项：

| 已确认项 | 对应正式文档位置 |
|---|---|
| Keycloak 角色口径：只保留 `admin_console_access`、`platform_admin`、`break_glass_admin`，日常管理角色由 Platform Admin RBAC 承载 | [Keycloak 配置设计 §6](../01-architecture/05-keycloak-configuration-design/README.md) |
| 业务应用角色分配采用统一门户编排、业务应用落库的模式 | [用户与权限模型设计 §11](../01-architecture/04-user-permission-model/README.md) |
| 业务应用准入校验契约：校验 `resource_access[client_id].roles`，返回 `401 UNAUTHENTICATED` / `403 APP_ACCESS_DENIED` | [总体架构设计 §12](../01-architecture/01-overall-architecture/README.md) |
| 撤权 API 状态与响应契约：`200 OK` / `202 Accepted` / `409 Conflict` / `502 Bad Gateway` / `424 Failed Dependency` | [API 设计 §7](../02-application/02-api-design/README.md) |
| Keycloak Group 不作为准入事实源，只作为组织、人群、批量管理或批量授权输入 | [Keycloak 配置设计 §8](../01-architecture/05-keycloak-configuration-design/README.md)、[用户与权限模型设计 §7](../01-architecture/04-user-permission-model/README.md) |
| Outbox、Audit、Webhook 链路字段：`trace_id`、`operation_id` 贯穿所有事件表 | [同步与事件设计 §6.1](../02-application/03-sync-event-design/README.md) |
| 数据库 snake_case，API / MQ / Webhook JSON payload camelCase | [同步与事件设计 §5](../02-application/03-sync-event-design/README.md) |
| `requestId` / `traceId` / `operationId` / `eventId` 语义定义 | [同步与事件设计 §5](../02-application/03-sync-event-design/README.md) |
| 事件 payload 必须包含 `eventVersion`，用于 MQ、Webhook 和 connector 契约演进 | [同步与事件设计 §11.1](../02-application/03-sync-event-design/README.md) |

## 2. 新发现的待讨论点

以下问题尚未固化，后续讨论后继续补充到本文：

（暂无）

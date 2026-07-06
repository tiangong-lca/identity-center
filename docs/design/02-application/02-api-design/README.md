---
docType: design-doc
scope: repo
status: active
authoritative: true
owner: identity-center
language: zh
whenToUse: 需要了解管理后台 API 的设计原则、响应信封或错误分类时阅读本文档。
whenToUpdate: API 设计原则、响应信封或错误分类发生变化时更新本文档，并同步更新 docs/references/openapi.yaml。
checkPaths:
  - docs/design/02-application/02-api-design/README.md
  - docs/references/openapi.yaml
lastReviewedAt: 2026-07-06
lastReviewedCommit: 16f3661
---

# 07. API 设计

## 1. 目标

本文定义 Next.js 用户门户与管理后台的 API 边界。

API 由 Next.js 服务端接口提供，作为管理后台和账号中心的服务端入口：

- Keycloak Admin REST API。
- 平台权限中心。
- 审计日志存储。
- 业务应用 connector 或 webhook 投影服务。

## 2. 通用约定

### 2.1 路径前缀

```text
/api/admin/*
/api/public/*
/api/account/*
/api/internal/*
```

说明：

- `/api/admin/*`：管理后台接口。
- `/api/public/*`：注册、找回密码等未登录公共入口。
- `/api/account/*`：当前用户账号中心接口。
- `/api/internal/*`：内部同步或系统间调用接口。

### 2.2 鉴权要求

所有管理接口必须：

- 已登录。
- Keycloak token 具备 `admin_console_access`、`platform_admin` 或 `break_glass_admin`。
- 管理后台本地权限模型中拥有目标 permission code。
- 管理后台本地权限模型中拥有目标资源 scope。
- 写操作记录审计日志。

未登录返回：

```text
401 Unauthorized
```

无权限返回：

```text
403 Forbidden
```

### 2.3 响应结构

成功：

```json
{
  "data": {},
  "requestId": "req_..."
}
```

失败：

```json
{
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "用户不存在",
    "details": {}
  },
  "requestId": "req_..."
}
```

## 3. 分页与筛选

列表接口统一支持：

```text
page
pageSize
keyword
sort
order
filters
```

响应：

```json
{
  "data": {
    "items": [],
    "page": 1,
    "pageSize": 20,
    "total": 100
  }
}
```

## 4. 用户管理 API

### 4.1 查询用户列表

```text
GET /api/admin/users
```

查询参数：

```text
keyword
status
organizationId
applicationId
role
mfaEnabled
createdFrom
createdTo
lastLoginFrom
lastLoginTo
```

### 4.2 创建用户

```text
POST /api/admin/users
```

请求：

```json
{
  "email": "user@example.com",
  "displayName": "Alice",
  "groups": [],
  "sendVerifyEmail": true
}
```

说明：

- 服务端调用 Keycloak Admin API。
- 不建议在请求中传明文永久密码。
- 如必须传初始密码，必须设置为临时密码。

### 4.3 用户详情

```text
GET /api/admin/users/{id}
```

返回：

```json
{
  "id": "portal-user-id",
  "keycloakSub": "sub",
  "email": "user@example.com",
  "displayName": "Alice",
  "status": "active",
  "groups": [],
  "roles": [],
  "applications": []
}
```

### 4.4 更新用户

```text
PATCH /api/admin/users/{id}
```

可更新：

- displayName。
- email。
- enabled。
- metadata。

### 4.5 启用/禁用用户

```text
POST /api/admin/users/{id}/enable
POST /api/admin/users/{id}/disable
```

禁用用户时：

- 调用 Keycloak 禁用用户。
- 强制登出用户。
- 发布同步事件。
- 记录审计日志。

只有 Keycloak disable 成功，才能认为用户已禁用。若 Keycloak disable 失败，不能把平台镜像状态标记为 disabled。

### 4.6 重置密码

```text
POST /api/admin/users/{id}/reset-password
```

推荐触发 Keycloak 邮件动作，不直接设置永久密码。

### 4.7 重置 MFA

```text
POST /api/admin/users/{id}/reset-mfa
```

高风险操作，需要更高权限和二次确认。

### 4.8 注册申请与审批

注册申请提交：

```text
POST /api/public/registration-requests
```

管理后台审批：

```text
GET /api/admin/registration-requests
GET /api/admin/registration-requests/{id}
POST /api/admin/registration-requests/{id}/approve
POST /api/admin/registration-requests/{id}/reject
```

提交请求示例：

```json
{
  "email": "user@example.com",
  "displayName": "Alice",
  "organizationId": "org_123",
  "reason": "申请访问产品碳足迹数据库系统"
}
```

审批通过请求示例：

```json
{
  "reviewComment": "通过注册申请",
  "sendActivationEmail": true
}
```

说明：

- 注册默认需要审批，免审批模式等价于系统自动通过注册申请。
- 注册申请写入 `registration_requests`。
- 审批通过后，服务端创建或启用 Keycloak 用户，并确保 `portal_users` 中存在对应记录。
- 审批拒绝时，不创建可登录账号；如 Keycloak 用户已存在，必须保持禁用或清理。
- 审批通过不自动授予业务应用访问权限；应用准入和应用角色仍通过应用准入 API、应用角色分配 API 管理。
- 审批、拒绝、账号创建、激活邮件发送都必须写审计日志。

## 5. 平台组织与映射 API

```text
GET /api/admin/platform-organizations
POST /api/admin/platform-organizations
GET /api/admin/platform-organizations/{id}
PATCH /api/admin/platform-organizations/{id}
GET /api/admin/platform-organizations/{id}/members
POST /api/admin/platform-organizations/{id}/members
DELETE /api/admin/platform-organizations/{id}/members/{userId}
GET /api/admin/platform-organizations/{id}/application-mappings
POST /api/admin/platform-organizations/{id}/application-mappings
```

说明：

- 平台维护平台组织目录和平台组织成员关系。
- 业务应用维护自己的业务组织/租户语义。
- 平台只保存平台组织与业务应用组织的映射关系。

## 6. 应用管理 API

```text
GET /api/admin/applications
POST /api/admin/applications
GET /api/admin/applications/{id}
PATCH /api/admin/applications/{id}
```

应用字段：

```json
{
  "code": "crm",
  "name": "CRM",
  "keycloakClientId": "crm-web",
  "loginUrl": "https://crm.example.com",
  "adminUrl": "https://crm.example.com/admin",
  "status": "active",
  "accessClientRole": "crm_access"
}
```

## 7. 应用准入 API

```text
GET /api/admin/applications/{id}/assignments
POST /api/admin/applications/{id}/assignments
DELETE /api/admin/applications/{id}/assignments/{assignmentId}
```

说明：

- 写 `application_assignments`。
- `application_assignments` 是平台准入事实源。
- 平台内部使用 `portalUserId` 关联 `portal_users.id`。
- 如果外部调用只提供 `keycloakSub`，服务端必须先解析到 `portal_users.id` 再写入准入关系。
- 应用准入默认投影到 Keycloak Client Role。
- Keycloak Group 只用于组织、部门、批量管理、管理员分组或批量授权输入，不作为准入事实源，也不是业务应用放行信号。
- 只表示用户是否可以进入应用，不表示用户在应用中的角色。

授权请求示例：

```json
{
  "portalUserId": "portal-user-id",
  "applicationCode": "product-footprint-db",
  "status": "active"
}
```

授权返回需要包含事实状态和投影状态：

```json
{
  "id": "assignment-id",
  "status": "active",
  "projectionStatus": "pending",
  "businessProjectionStatus": "pending"
}
```

撤销应用准入时，平台事实可立即变为 `revoked`，但撤销完成必须以 Keycloak Client Role 移除成功为关键完成点。业务应用投影失败时进入重试、告警和对账。

撤权请求可以异步编排，但 API 和 UI 不能把“请求已提交”显示成“撤权已完成”。

撤权响应语义：

```text
200 OK
  平台事实已 revoked
  Keycloak Client Role 已移除
  关键撤权点已完成
  业务侧可能仍在回收中

202 Accepted
  平台事实已 revoked
  Keycloak Client Role 移除仍在 pending
  操作已进入异步处理和追踪

409 Conflict
  当前 assignment 状态不允许撤权

502 Bad Gateway / 424 Failed Dependency
  平台事实已 revoked
  Keycloak Client Role 移除失败
  projectionStatus = failed
  响应必须显式表达 failed 或 partial，不能显示为撤权完成
```

撤权响应字段：

```json
{
  "data": {
    "assignmentId": "assignment-id",
    "operationId": "operation-id",
    "status": "revoked",
    "projectionStatus": "synced",
    "businessProjectionStatus": "pending",
    "lastProjectionError": null,
    "requiresManualAction": false
  },
  "requestId": "req_..."
}
```

`projectionStatus = failed` 时，管理后台必须显示“平台已撤销，认证侧撤权失败，需要处理”，并进入告警、重试、人工处理视图和对账。

## 8. 应用角色分配 API

应用角色目录：

```text
GET /api/admin/applications/{id}/roles
POST /api/admin/applications/{id}/roles
PATCH /api/admin/applications/{id}/roles/{roleId}
```

用户应用角色分配：

```text
GET /api/admin/applications/{id}/role-assignments
POST /api/admin/applications/{id}/role-assignments
DELETE /api/admin/applications/{id}/role-assignments/{assignmentId}
```

说明：

- `application_roles` 是平台可分配的应用角色目录。
- `application_user_roles` 是“用户在某个应用中是什么角色”的平台事实源。
- 平台内部使用 `portalUserId` 关联 `portal_users.id`。
- 如果外部调用只提供 `keycloakSub`，服务端必须先解析到 `portal_users.id` 再写入角色分配。
- 平台管理角色分配，例如“产品碳足迹数据库系统 / 数据审核员”。
- 业务应用管理该角色具体拥有哪些业务权限，例如是否可以编辑、审核、管理团队。
- 角色分配变更需要投影给业务应用，并进入重试、告警和对账。

示例：

```json
{
  "applicationCode": "product-footprint-db",
  "portalUserId": "portal-user-id",
  "roleCode": "data_reviewer",
  "scope": {
    "type": "org",
    "id": "org_123"
  }
}
```

## 9. 管理后台角色权限 API

管理后台角色：

```text
GET /api/admin/admin-roles
POST /api/admin/admin-roles
GET /api/admin/admin-permissions
POST /api/admin/admin-roles/{id}/permissions
DELETE /api/admin/admin-roles/{id}/permissions/{permissionId}
```

这些 API 管理统一身份平台管理后台自身的角色和权限。

业务应用中“角色具体对应哪些资源权限和数据访问规则”不由统一身份平台 API 直接修改。

## 10. 审计日志 API

```text
GET /api/admin/audit-logs
```

筛选：

```text
actor
action
targetType
targetId
result
createdFrom
createdTo
```

审计日志默认只读，不提供普通删除接口。导出审计需要 `audit_logs.export` 权限，并且导出行为本身必须写审计。

## 11. 错误码

| 错误码 | HTTP | 说明 |
|---|---:|---|
| UNAUTHENTICATED | 401 | 未登录 |
| FORBIDDEN | 403 | 无权限 |
| APP_ACCESS_DENIED | 403 | 缺少当前应用准入 Client Role |
| USER_NOT_FOUND | 404 | 用户不存在 |
| APPLICATION_NOT_FOUND | 404 | 应用不存在 |
| VALIDATION_ERROR | 400 | 参数错误 |
| CONFLICT | 409 | 状态冲突 |
| KEYCLOAK_ERROR | 502 | Keycloak 调用失败 |
| DEPENDENCY_FAILED | 424 | 依赖系统操作失败 |
| SYNC_PENDING | 202 | 操作已提交，等待同步 |
| RATE_LIMITED | 429 | 请求过快 |

## 12. 幂等性

高风险写操作建议支持：

```text
Idempotency-Key
```

适用：

- 创建用户。
- 分配应用。
- 禁用用户。
- 发送邮件动作。

## 13. API 安全要求

- 所有写操作校验 CSRF 或使用同源策略与安全 cookie。
- 所有参数服务端校验。
- 所有管理操作写审计日志。
- 不返回 Keycloak Admin token。
- 不返回敏感 secret。
- 禁止浏览器直接访问 Keycloak Admin API。

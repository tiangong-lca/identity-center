# 统一身份平台已确认设计决议

> 仅记录已经确认并已用于优化正式设计文档的目标态设计决议。
> 本文不是实施方案，不描述实施顺序、范围裁剪或临时过渡方案。

## 1. 文档口径

### 已确认决定

正式设计文档描述目标态完整设计，不在设计文档中使用阶段、MVP、第一阶段、第二阶段来裁剪范围。

实施顺序、里程碑、先后落地和临时裁剪应放入后续实施方案，而不是放入架构设计文档。

### 对现有文档的影响

现有文档中类似以下表达需要调整：

- 第一阶段建议。
- 后续再考虑。
- 可选实现但没有默认目标态。
- 阶段 1/2/3/4 落地步骤。

调整方式：

- 设计文档保留目标态职责、边界、数据模型和交互契约。
- 实施方案单独描述如何分批建设。

## 2. 权限边界

### 已确认决定

目标态中可以存在平台权限中心或平台授权服务，但它只管理跨应用共享授权事实，不接管所有业务系统的细粒度业务权限。

平台权限中心管理：

- 应用目录。
- 应用准入。
- 平台组织目录。
- 平台组织与业务应用的映射。
- 管理后台权限。
- 跨应用角色模板或授权投影。

业务系统继续管理：

- 本应用内部业务角色。
- 资源级权限。
- 数据行级权限。
- 业务动作权限。
- 业务组织内权限。
- 业务应用本地数据访问控制所依赖的权限表和策略。

### 设计原则

统一的是身份和跨应用准入，不是所有业务权限。

```text
Keycloak 管身份认证
平台权限中心管跨应用共享授权事实
业务系统管业务域权限执行
```

### 对现有文档的影响

现有文档中出现“权限中心 / 应用权限服务”时，需要明确：

- 权限中心不是全局业务权限数据库。
- 权限中心不能绕过业务系统自己的授权判断。
- 业务系统可以消费权限中心投影，但最终业务数据访问仍由业务系统执行。

## 3. 应用准入表达方式

### 已确认决定

平台数据库中的应用准入记录是准入事实源。

Keycloak 中使用 Client Role 作为应用准入投影。

Group 用于组织、部门、批量管理和管理员分组，不作为最终应用准入事实源。

### 目标态模型

```text
Portal/Authz DB
  application_assignments
    -> 平台准入事实源

Keycloak Client Role
  crm-web: crm_access
  billing-web: billing_access
  supabase-business-app: supabase_app_access
    -> 准入投影

Keycloak Group
  /departments/finance
  /departments/engineering
  /admins/platform
    -> 组织、部门、批量管理、后台管理员分组
```

### 设计原则

Client Role 更贴近“某个 client 的访问资格”，也更容易在 token claim 中按应用隔离。

Group 更适合表达组织结构、人群和批量管理关系。

Group 可以作为批量授权输入，但不能作为应用准入事实源，也不能作为业务应用放行信号。

例如管理员可以选择一个 Group 作为授权输入：

```text
给 /departments/finance 批量开通 Billing 应用
```

但执行时必须展开为平台准入事实：

```text
application_assignments
  Alice -> billing active
  Bob -> billing active
  Carol -> billing active
```

然后再投影为 Keycloak Client Role：

```text
billing-web: billing_access
```

业务应用放行时只能校验当前应用的 Client Role，不能用 Group 作为放行依据。

正式文档应避免使用“应用准入组”表达准入事实。若需要描述 Group 参与授权流程，应使用：

```text
批量授权人群
授权输入用户组
应用授权人群
```

这些名称只表示输入来源或人群选择，不表示最终准入事实。

### 对现有文档的影响

现有文档中“同步到 Keycloak Group 或 Client Role”的表达应改为：

```text
应用准入默认同步到 Keycloak Client Role。
Group 可作为批量授权输入，但不是准入事实源，也不是业务应用放行信号。
批量授权必须展开写入 application_assignments，再投影到 Keycloak Client Role。
```

## 4. 组织与租户边界

### 已确认决定

平台维护平台组织目录，但不接管业务系统内部的完整组织/租户语义。

平台组织目录维护：

- 平台组织 ID。
- 组织 code/name/status。
- 基础上下级关系。
- 用户与平台组织的成员关系。
- 平台组织与业务应用组织的映射关系。

业务系统维护：

- 业务系统内部租户规则。
- 项目、部门、门店、客户等业务层级。
- 组织内业务角色。
- 资源归属。
- 数据权限。

### 目标态关系

```text
Platform Organization
  -> Business App Organization Mapping
    -> Business App Local Organization / Tenant
```

平台组织用于统一身份、应用准入、管理后台分域和跨应用映射。

业务系统组织用于具体业务规则、资源归属和数据访问控制。

### 对现有文档的影响

现有文档中 `organizations`、`organization_members` 标注为“平台/业务”时，需要拆清楚：

- 平台表表达平台组织目录和映射。
- 业务表表达业务域组织、租户和资源权限。

## 5. 已固化的核心边界摘要

```text
Keycloak
  - 身份认证
  - 账号生命周期
  - MFA / SSO
  - Token 签发
  - 应用准入投影

Identity Portal / Platform Authz
  - 用户生命周期编排
  - 应用目录
  - 应用准入事实源
  - 平台组织目录
  - 平台组织映射
  - 管理后台权限
  - 业务应用角色分配入口、编排、投影状态和审计
  - 审计

Business Applications
  - 本地用户映射
  - 本应用业务角色事实源
  - 本应用资源权限
  - 本应用组织/租户语义
  - 数据访问控制
  - 业务审计
  - Supabase 等应用如有本地 Auth/RLS，也归业务应用边界
```

## 6. 应用准入同步失败语义

### 已确认决定

`application_assignments` 是应用准入事实源。

Keycloak Client Role 是认证侧准入投影。

业务系统可以消费准入事件或维护本地准入投影，但不能反向修改平台准入事实源。

当平台写入 `application_assignments` 成功，但同步 Keycloak Client Role 失败时，采用“事实已变更，但投影未完成”的语义。

### 目标态语义

```text
写入 application_assignments 成功
  -> 平台准入事实成立
  -> assignment.status = active
  -> projection_status = pending | synced | failed
  -> 同步 Keycloak Client Role
  -> 同步失败时不回滚 application_assignments
  -> 进入重试、告警和人工修复流程
```

### 可登录性

平台准入事实成立不等于用户已经能立即登录目标应用。

实际能否登录取决于认证侧准入投影是否完成，即 Keycloak token 中是否已经具备目标应用 Client Role。

因此 UI 和 API 必须同时表达：

- 平台准入状态。
- Keycloak 投影状态。
- 最近一次同步错误。
- 下一次重试或人工处理状态。

### 设计原则

不因为 Keycloak 投影失败回滚平台准入事实。

原因：

- 权威源必须清晰，Keycloak 不是平台准入事实源。
- 后续可能存在多个投影目标，例如 Keycloak、业务系统本地缓存或特定业务应用的本地准入投影。
- 多投影目标无法依赖单个远端系统失败来决定事实源事务回滚。
- 可重试投影、对账和告警比跨系统强事务更适合该场景。

### 对数据模型的影响

`application_assignments` 需要表达事实状态和投影状态，例如：

```text
application_assignments
  - id
  - application_id
  - keycloak_sub
  - status
  - source
  - expires_at
  - projection_status
  - last_projection_error
  - projected_at
  - created_at
  - updated_at
```

其中：

- `status` 表达平台准入事实状态。
- `projection_status` 表达准入投影状态。
- `last_projection_error` 用于诊断最近一次投影失败原因。
- `projected_at` 表示最近一次成功投影时间。

## 7. 撤权类操作的一致性边界

### 已确认决定

新增授权和撤权类操作使用不同一致性语义。

新增授权可以采用最终一致：

```text
平台准入事实已授权
认证侧或业务侧投影同步中
```

撤权类操作必须更严格：

```text
事实源立即记录撤权意图或撤权事实
关键执行点完成后才能声明撤权完成
失败必须告警、重试和进入人工处理视图
```

撤权类操作包括：

- 用户禁用。
- 用户删除或注销。
- 应用准入撤销。
- 高权限角色撤销。

## 8. 用户禁用语义

### 已确认决定

Keycloak 是账号状态事实源。

用户禁用必须以 Keycloak disable 成功为准。

### 目标态流程

```text
管理员提交禁用用户
  -> 写审计操作意图
  -> 调用 Keycloak disable user
  -> 调用 Keycloak logout user sessions
  -> 更新 portal_users 镜像状态
  -> 发布 identity.user.disabled 事件
  -> 业务系统回收本地访问
```

### 完成标准

只有 Keycloak disable 成功，才能认为用户已禁用。

如果 Keycloak disable 失败：

```text
portal_users 不标记为 disabled
API 返回失败
审计记录失败结果
触发告警或人工处理
```

如果 Keycloak disable 成功，但本地镜像更新或事件发布失败：

```text
Keycloak 事实已禁用
portal_users 标记为 sync_failed 或 needs_reconcile
进入重试和对账
UI 显示 Keycloak 已禁用但平台镜像未同步完成
```

## 9. 用户删除语义

### 已确认决定

用户删除不作为普通实时物理删除操作。

目标态将用户生命周期拆为：

```text
disable
deprovision
delete
```

含义：

- `disable`：立即禁止登录。
- `deprovision`：回收应用准入、业务系统投影和相关会话。
- `delete`：合规或生命周期清理动作，通常异步、可审计、可延迟。

### 设计原则

默认管理后台不应把物理删除作为普通操作。

物理删除必须单独定义：

- 保留策略。
- 审计要求。
- 关联数据处理。
- 可恢复窗口。
- 合规依据。

删除完成标准不能只看 Keycloak delete 成功，还必须满足审计、保留和关联清理策略。

## 10. 应用准入撤销语义

### 已确认决定

`application_assignments` 仍是应用准入事实源。

应用准入撤销属于安全敏感撤权操作。

平台准入事实可以立即变为 `revoked`，但“撤销完成”必须以 Keycloak Client Role 移除成功为关键完成点。

### 目标态流程

```text
管理员撤销应用准入
  -> application_assignments.status = revoked
  -> projection_status = pending
  -> 移除 Keycloak Client Role
  -> 发布 access.application.revoked
  -> 通知业务系统回收本地准入投影
```

### 完成标准

```text
平台事实状态：application_assignments.status = revoked
认证侧完成：Keycloak Client Role 已移除
业务侧完成：业务系统已消费撤销事件或对账完成
```

面向管理员 UI 时，至少区分：

- 平台已撤销。
- 认证侧已撤销。
- 业务侧回收中。
- 撤销失败，需要处理。

如果 Keycloak Client Role 移除失败：

```text
application_assignments.status = revoked
projection_status = failed
last_projection_error = 最近一次失败原因
UI 显示“平台已撤销，认证侧撤销失败”
触发告警
持续重试
进入人工处理视图
```

### API 状态与响应契约

撤权请求可以异步编排，但 API 和 UI 不能把“请求已提交”显示成“撤权已完成”。

`DELETE /api/admin/applications/{id}/assignments/{assignmentId}` 的语义是：

```text
调用成功不等于撤权全部完成
调用成功表示撤权操作已被平台接受，并进入可追踪状态
```

撤权状态至少拆为三层：

```text
平台事实
  application_assignments.status = revoked

认证侧投影
  projection_status = pending | synced | failed
  表示 Keycloak Client Role 是否已移除

业务侧投影
  business_projection_status = pending | synced | failed | not_configured
  表示业务应用本地准入、业务角色或会话是否已回收
```

推荐响应语义：

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
  例如已经处于互斥的删除、注销或去供应流程

502 Bad Gateway / 424 Failed Dependency
  平台事实已 revoked
  Keycloak Client Role 移除失败
  projection_status = failed
  响应必须显式表达 partial / failed，而不能显示为撤权完成
```

管理后台直接撤权操作推荐同步尝试移除 Keycloak Client Role。如果 Keycloak 移除失败，API 应显式返回失败或部分成功语义，同时保留重试、告警、人工处理和操作追踪。

推荐响应字段：

```json
{
  "data": {
    "assignmentId": "asg_123",
    "operationId": "op_123",
    "status": "revoked",
    "projectionStatus": "synced",
    "businessProjectionStatus": "pending",
    "lastProjectionError": null,
    "requiresManualAction": false
  },
  "requestId": "req_123"
}
```

UI 文案必须绑定状态：

```text
status = revoked
projectionStatus = synced
  -> 认证侧已撤权

status = revoked
projectionStatus = pending
  -> 平台已撤销，认证侧撤权处理中

status = revoked
projectionStatus = failed
  -> 平台已撤销，认证侧撤权失败，需要处理
```

关键要求：

- `operationId` 必须返回给前端，用于查询撤权链路和排障。
- `projectionStatus = failed` 时不能显示“撤权完成”。
- Keycloak Client Role 移除失败不回滚 `application_assignments.status = revoked`。
- 失败状态必须进入告警、重试、人工处理视图和对账。

### Token 有效期影响

即使 Keycloak Client Role 已移除，用户已有 access token 可能仍在有效期内。

因此高敏应用撤权还需要：

- 缩短 access token TTL。
- 必要时触发用户会话登出。
- 业务系统后端校验本地准入状态。
- 业务系统消费撤销事件或通过对账回收本地投影。

## 11. 事件通道目标态

### 已确认决定

目标态事件通道采用组合模式：

```text
Portal/Authz DB Outbox
  -> Message Queue
  -> Internal Workers / Webhook Delivery / Connectors
  -> Reconciliation Jobs
```

各通道职责：

- DB Outbox 是平台事实变更的可靠事件源。
- MQ 是平台内部异步分发和多消费者传输层。
- Webhook 是外部业务系统通知通道。
- Reconciliation Job 是安全兜底和差异修复机制。

### DB Outbox

所有平台事实变更必须在同一个数据库事务中写事实表和 `outbox_events`。

示例：

```text
transaction:
  update application_assignments
  insert outbox_events
commit
```

这样避免业务事实已变更但事件丢失。

Outbox 是事件事实源。MQ 不是事实源。

### Message Queue

目标态优先选型为 RabbitMQ Quorum Queue。

MQ 设计必须兼容后续国产化和信创替换要求。

投递语义：

```text
at-least-once
```

消费者要求：

- 按 `event_id` 幂等。
- 可重复消费。
- 失败可重试。
- 重试耗尽后进入 DLQ。
- 高风险撤权事件失败必须告警。

MQ 用于平台内部异步分发：

- Keycloak 投影 worker。
- 审计和安全告警 worker。
- Webhook delivery worker。
- 业务应用同步 worker。
- 业务系统 connector。
- 对账触发任务。

### RabbitMQ 优先选型理由

身份平台事件主要是可靠业务事件分发，而不是高吞吐数据流分析。

典型事件包括：

- 用户禁用。
- 应用准入授权。
- 应用准入撤销。
- 高权限角色变更。
- Webhook 投递。
- 投影同步。
- 死信和人工处理。

RabbitMQ 更贴近任务队列、路由、重试、DLQ 和业务操作事件分发场景。

RabbitMQ Quorum Queue 提供复制型持久队列，适合安全敏感事件链路。

因此常规部署优先采用 RabbitMQ Quorum Queue。

### MQ Adapter 边界

架构优先采用 RabbitMQ，但代码层必须通过 MQ adapter 隔离具体 MQ 产品、厂商 SDK 和协议细节。

系统应通过 MQ adapter 封装具体 MQ：

```text
server/events/outbox
server/events/publisher
server/events/consumers
lib/mq/rabbitmq
```

MQ adapter 的目的：

- 隔离厂商 SDK。
- 降低测试复杂度。
- 便于本地开发使用替身实现。
- 避免业务代码直接依赖 MQ 产品 API。
- 为国产化和信创替换预留稳定边界。

### 国产化兼容要求

如果项目后续进入信创部署场景，MQ 必须能够替换为客户或组织信创清单中的国产 MQ。

国产 MQ 候选包括：

- 东方通 `TongLINK/Q-CN`。
- 宝兰德 `BES MQ`。
- 金蝶天燕 `Apusic ADMQ`。
- 中创 `InforSuite MQ`。
- 普元 `Primeton MQ`。

云上国产化候选包括：

- 华为云 DMS。
- 腾讯云 TDMQ。
- 阿里云 RocketMQ。

国产化替换需要满足同一组平台语义：

MQ 产品变更不得改变：

- `outbox_events` 事实源。
- 事件契约。
- 消费者幂等要求。
- DLQ 和人工处理语义。
- 对账兜底机制。

国产化替换需要通过 POC 验证：

- at-least-once 投递。
- 持久化。
- 重试。
- DLQ 或等价死信机制。
- 延迟重试或可调度重试。
- 消费者组或等价消费模型。
- 管理控制台。
- 国产 OS、CPU、Kubernetes 适配证明。
- 原厂支持与信创证明材料。

### Webhook

外部业务系统不直接消费平台内部 MQ。

平台通过 Webhook 或业务系统 connector 通知外部系统。

Webhook 要求：

- 签名。
- 时间戳。
- 重放保护。
- 重试。
- 死信。
- 订阅配置。
- 投递日志。

### Reconciliation

即使有 Outbox、MQ 和 Webhook，也必须保留对账任务。

对账范围：

- Portal/Authz DB vs Keycloak Client Role。
- Portal/Authz DB vs 业务系统本地投影。
- Portal/Authz DB vs 业务应用本地准入投影。
- Keycloak 用户状态 vs `portal_users` 镜像。

### 建议事件表

```text
outbox_events
  - id
  - event_type
  - aggregate_type
  - aggregate_id
  - payload
  - status
  - occurred_at
  - published_at
  - retry_count
  - last_error
  - trace_id

webhook_deliveries
  - id
  - event_id
  - subscriber_id
  - status
  - attempt_count
  - next_retry_at
  - response_status
  - last_error

processed_events
  - event_id
  - consumer
  - processed_at
```

## 12. 数据库选型与国产化兼容

### 已确认决定

主数据库使用 PostgreSQL。

数据库设计、迁移脚本、查询写法和数据访问层必须兼容 KingbaseES 的 PostgreSQL 兼容模式。

目标态数据库边界：

```text
默认数据库：PostgreSQL
国产化兼容目标：KingbaseES PostgreSQL 兼容模式
```

### 适用范围

该选型适用于：

- Portal DB。
- Platform Authz DB。
- Audit DB。
- Outbox/Event DB。

Keycloak DB 由 Keycloak 部署要求单独决定，不纳入 Portal/Authz 的业务数据库设计边界。

各业务系统数据库保持自治，不要求统一迁移到 PostgreSQL 或 KingbaseES。

### 设计原则

数据库设计采用 PostgreSQL 语义，但必须控制 PostgreSQL 专有能力的使用范围，避免后续迁移到 KingbaseES 时出现不可控差异。

允许使用：

- 标准事务。
- 主键、外键、唯一约束。
- 普通 B-tree 索引。
- 明确的 check constraint。
- `timestamp with time zone` 或等价时间类型。
- JSON/JSONB 作为非核心扩展字段。
- `SELECT ... FOR UPDATE` 等明确行锁语义。

谨慎使用：

- PostgreSQL extension。
- trigger。
- stored procedure。
- advisory lock。
- LISTEN/NOTIFY。
- partial index。
- expression index。
- 复杂 JSONB 查询和索引。
- 强依赖 PostgreSQL 系统表的逻辑。

禁止作为核心设计依赖：

- 用数据库函数承载核心业务流程。
- 用数据库特有扩展承载核心授权逻辑。
- 依赖不可迁移的 PostgreSQL 隐式行为。
- 将跨系统同步语义绑定到数据库私有事件机制。

### Metadata 使用约束

JSON/JSONB 可以用于 `metadata`，但只保存扩展展示信息或低风险附加属性。

核心字段必须结构化：

- 身份主键。
- 用户状态。
- 应用准入状态。
- 投影状态。
- 组织成员关系。
- 管理后台权限。
- 审计关键字段。
- outbox 事件状态。

### 数据访问层要求

应用代码必须通过 repository 或 query service 访问数据库。

禁止页面组件、前端 feature 模块、Keycloak adapter、MQ adapter 直接访问数据库。

数据库访问层需要隔离：

- SQL 方言差异。
- 分页写法。
- 时间类型映射。
- JSON 字段读写差异。
- 错误码和唯一约束冲突映射。
- migration 工具差异。

### 迁移要求

所有数据库变更必须通过 migration 管理。

每个 migration 需要考虑：

- PostgreSQL 执行结果。
- KingbaseES PostgreSQL 兼容模式执行结果。
- 回滚策略。
- 大表变更风险。
- 索引创建对写入的影响。

正式进入国产化部署前，必须对完整 migration 链路在 KingbaseES 上做 POC 验证。

### 兼容性测试要求

至少覆盖：

- schema migration。
- repository 集成测试。
- 唯一约束冲突。
- 事务回滚。
- 行锁。
- 分页查询。
- JSON/metadata 读写。
- outbox 事件写入和轮询。
- 审计日志写入和查询。

## 13. Keycloak 用户标识语义

### 已确认决定

`keycloak_sub` 是全平台、跨系统、稳定身份主键。

`keycloak_user_id` 是 Keycloak Admin API 操作用的技术标识。

两者不能混用，也不能假设永远相等。

### keycloak_sub

`keycloak_sub` 用于识别同一个人在平台和业务系统中的统一身份。

适用场景：

```text
portal_users.keycloak_sub
application_assignments.keycloak_sub
organization_members.keycloak_sub
audit_logs.actor_keycloak_sub
audit_logs.target_keycloak_sub
identity.user.disabled target.keycloakSub
业务系统 app_users.keycloak_sub
业务应用本地用户映射表.keycloak_sub
```

设计要求：

- `keycloak_sub` 不允许为空。
- `keycloak_sub` 不使用 email 替代。
- `keycloak_sub` 在同一身份域内唯一。
- `keycloak_sub` 不因 email、username、phone 变更而改变。
- 审计、事件和跨系统映射必须优先使用 `keycloak_sub`。

### keycloak_user_id

`keycloak_user_id` 可以保存在 `portal_users` 中，但它不是平台身份主键。

用途：

- 调用 Keycloak Admin REST API 时定位用户。
- 减少每次通过 `sub` 或 email 查询 Keycloak 用户的成本。
- 辅助对账 Keycloak 用户记录。

限制：

- 不能作为跨系统身份键。
- 不能出现在业务系统本地用户映射里。
- 不能作为审计主标识。
- 不能作为事件 payload 的主身份字段。
- 不能被前端或外部系统依赖。

### 两者关系

在某些 Keycloak 配置中，`keycloak_sub` 和 Keycloak Admin API user id 的值可能相同。

设计不能依赖这个假设。

```text
keycloak_sub 和 keycloak_user_id 可以值相同，但语义不同。
系统必须按两个字段处理，不允许假设二者永远相等。
```

### 表字段建议

```text
portal_users
  - id
  - keycloak_sub unique not null
  - keycloak_user_id unique nullable
  - email
  - display_name
  - status
  - sync_status
  - created_at
  - updated_at
```

`keycloak_user_id` 允许为空。原因是本地可能先从 token 建立用户镜像，此时尚未完成 Keycloak Admin API 对账。

### 事件 payload

事件主字段使用 `keycloakSub`。

```json
{
  "target": {
    "keycloakSub": "..."
  }
}
```

如果确实需要携带 `keycloakUserId`，只能放在内部诊断字段，不作为消费者主键。

## 14. 管理后台权限模型

### 已确认决定

Keycloak Realm Role 只负责管理后台准入和少量种子角色。

Platform Admin RBAC 是管理后台细粒度权限事实源。

```text
Keycloak Realm Role
  -> 管理后台入口门禁
  -> break-glass / 初始化种子身份

Platform Admin RBAC
  -> 管理后台权限事实源
  -> permission
  -> scope
  -> 临时授权
  -> 高风险操作策略
```

### Keycloak Realm Role

Keycloak 中只保留入口级角色：

```text
admin_console_access
platform_admin
break_glass_admin
```

用途：

- 判断是否允许进入管理后台。
- 提供紧急超级管理员种子身份。
- 初始化或修复平台本地 RBAC。

限制：

- 不表达具体菜单权限。
- 不表达资源范围。
- 不表达组织范围。
- 不表达临时授权。
- 不表达审批规则。
- 不作为细粒度管理 API 的最终判断依据。

### Platform Admin RBAC

平台本地数据库作为管理后台权限事实源。

建议模型：

```text
admin_roles
  - id
  - code
  - name
  - description
  - built_in
  - created_at
  - updated_at

admin_permissions
  - id
  - code
  - name
  - resource
  - action
  - description

admin_role_permissions
  - role_id
  - permission_id

admin_user_roles
  - id
  - keycloak_sub
  - role_id
  - scope_type
  - scope_id
  - expires_at
  - granted_by
  - created_at
```

权限 code 示例：

```text
users.read
users.create
users.disable
users.reset_password
users.reset_mfa
applications.read
applications.assign_user
applications.revoke_user
organizations.read
organizations.manage_members
audit_logs.read
audit_logs.export
admin_roles.manage
```

### Scope 模型

`admin_user_roles` 必须支持授权范围：

```text
scope_type = global | organization | application
scope_id = null | org_id | application_id
```

示例：

```text
Alice 是全局 platform_admin
Bob 是 org_123 的 user_admin
Carol 是 crm 应用的 app_admin
David 是全局 auditor，但只能 read 不能 export
```

### API 鉴权顺序

所有 `/api/admin/*` 必须按以下顺序判断：

```text
1. 已登录
2. Keycloak token 有 admin_console_access、platform_admin 或 break_glass_admin
3. 加载 Platform Admin RBAC
4. 判断 permission code
5. 判断 scope
6. 高风险操作检查近期认证 / MFA / 审批
7. 写审计
```

前端可以基于权限隐藏按钮，但只是体验优化。服务端 API 必须重新判断。

### Break-glass 管理员

系统保留紧急管理员角色：

```text
break_glass_admin
```

用途：

- 平台本地 RBAC 数据损坏时恢复管理权限。
- 初始化第一个平台管理员。
- 紧急修复权限配置。

限制：

- 必须强 MFA。
- 必须强审计。
- 建议限制来源 IP 或 VPN。
- 日常不使用。
- 所有操作必须告警。

### 设计原则

不要把管理后台细粒度权限长期放在 Keycloak Realm Role 中。

原因：

- 管理后台权限会包含组织、应用等资源范围。
- 管理后台权限需要临时授权和过期时间。
- 高风险操作可能需要审批或近期认证。
- 这些语义属于平台管理域，不属于身份认证域。

## 15. 审计日志设计

### 已确认决定

Audit DB 是平台管理审计的权威存储。

审计日志 append-only。

业务表不承担审计权威职责。

普通管理员不能修改或删除审计日志。

```text
Audit DB
  -> 平台管理审计权威存储

业务表
  -> 当前业务状态

outbox_events
  -> 事件投递状态

应用日志
  -> 排障和运行观测
```

### 审计范围

必须审计的平台操作：

- 用户创建、启用、禁用、删除或注销。
- 重置密码。
- 重置 MFA。
- 应用准入授权。
- 应用准入撤销。
- 应用准入过期。
- 管理后台角色授权。
- 管理后台角色撤销。
- 组织成员变更。
- Keycloak Client 配置变更。
- Redirect URI 变更。
- Service Account 权限变更。
- Webhook 订阅变更。
- 高风险配置变更。
- Break-glass 管理员操作。

建议审计的平台事件：

- 登录成功或失败摘要。
- 管理后台访问拒绝。
- 同步失败和人工重试。
- 对账差异和修复动作。
- Webhook 投递失败。

### 写入语义

管理写操作采用双层记录：

```text
audit intent
  -> 记录操作意图

audit result
  -> 记录执行结果
```

示例：

```text
intent:
  actor = admin
  action = user.disable
  target = user
  request_id = req_123

result:
  result = success | failed | partial
  before_data
  after_data
  error_code
  error_message
```

部分成功场景必须记录为 `partial`，例如 Keycloak disable 成功但事件发布失败。

### 不可篡改要求

目标态先固化为逻辑不可篡改：

- append-only。
- 不提供 update/delete 业务接口。
- 普通管理员不能删除。
- 删除或归档只能由系统归档任务执行。
- 审计表记录 `record_hash`。
- 审计表记录 `previous_hash`。
- 审计导出记录 hash。

`record_hash` 和 `previous_hash` 用于形成 hash chain，增强篡改检测能力。

如客户、监管或等保要求更高，可同步写入：

- WORM 存储。
- 对象存储保留策略。
- 专用日志平台。
- SIEM。

这些外部系统是防篡改增强，不替代 Audit DB 的平台审计权威地位。

### 保留周期

默认保留策略：

```text
高风险管理审计：至少 3 年
普通管理审计：至少 1 年
登录/访问摘要：至少 180 天
调试级应用日志：30-90 天
```

如果客户、监管、等保或行业规范要求更长，以合规要求覆盖默认策略。

### 敏感数据处理

审计日志不能直接保存：

- 密码。
- token。
- client secret。
- refresh token。
- 身份证完整号。
- 银行卡完整号。

敏感字段变更只记录：

- 字段名。
- 是否发生变更。
- 脱敏后的摘要。
- hash 或后四位等低风险辅助信息。

`before_data` 和 `after_data` 必须做字段级脱敏。

### 查询权限

审计查询受 Platform Admin RBAC 控制。

建议权限：

```text
audit_logs.read
audit_logs.export
audit_logs.read_sensitive
```

普通 `auditor` 只能查看脱敏审计。

导出审计和查看敏感字段需要更高权限，并且导出行为本身必须写审计。

### 表模型建议

```text
audit_logs
  - id
  - event_time
  - actor_keycloak_sub
  - actor_display_name
  - actor_ip
  - actor_user_agent
  - action
  - target_type
  - target_id
  - target_keycloak_sub
  - request_id
  - trace_id
  - result
  - risk_level
  - before_data
  - after_data
  - error_code
  - error_message
  - record_hash
  - previous_hash
  - created_at
```

## 16. 业务应用准入投影边界

### 已确认决定

Supabase 只是多个业务应用之一。

统一身份平台设计不详细设计 Supabase 应用或其他业务应用内部表结构。

平台只定义与业务应用的身份、准入、组织映射和事件同步边界。

### 平台负责

平台负责跨应用共享事实：

- 应用目录。
- 应用准入事实。
- 应用准入撤销事实。
- 平台组织目录。
- 平台组织与业务应用组织的映射关系。
- 用户禁用、注销、撤权等平台事件。
- `keycloak_sub` 跨系统身份标识。

### 业务应用负责

业务应用负责本应用内部授权和数据访问控制。

这包括但不限于：

- 本地用户映射。
- 本应用业务角色。
- 本应用资源权限。
- 本应用组织或租户语义。
- 本应用数据访问控制。
- 本应用审计。
- Supabase 应用中的 RLS、Auth、本地权限表等应用内设计。

统一身份平台设计不规定这些应用内部表结构。

### 平台可以投影到业务应用的内容

平台可以向业务应用投影以下平台事实：

```text
keycloak_sub
application_code
application_assignment_status
platform_org_id
business_app_org_mapping
user_disabled / user_enabled
access.application.granted
access.application.revoked
```

这些投影只表达平台级身份和准入事实。

它们不表达业务系统内部权限。

### 平台不接管的内容

平台不直接设计或接管：

- 业务应用内部角色表。
- 业务应用内部权限表。
- 业务应用资源级授权。
- 业务应用数据行级策略。
- Supabase RLS policy 的具体规则。
- Supabase Auth 内部表结构。
- 其他业务应用的业务数据库模型。

### Supabase 特别说明

Supabase 应用按业务应用处理。

平台只关心：

- 该用户是否允许进入 Supabase 应用。
- 该用户的 `keycloak_sub` 如何映射到 Supabase 应用本地用户。
- 平台准入撤销事件是否投影到 Supabase 应用。
- 平台组织映射是否需要投影给 Supabase 应用。

Supabase 应用内部如何维护 Auth、RLS、组织成员关系、业务角色和数据访问策略，属于 Supabase 应用自身设计，不在统一身份平台设计中展开。

### 撤权要求

当平台撤销某业务应用准入时：

```text
application_assignments.status = revoked
  -> 移除 Keycloak Client Role
  -> 发布 access.application.revoked
  -> 业务应用 connector / webhook 接收撤销事件
  -> 业务应用按自身设计回收本地准入投影
```

平台需要跟踪业务应用投影状态：

```text
business_projection_status = pending | synced | failed
last_business_projection_error
business_projected_at
```

如果业务应用投影失败：

- 平台准入事实仍为 revoked。
- Keycloak 撤权按认证侧规则处理。
- 业务应用投影进入 failed。
- 必须告警、重试和对账。

### 对正式设计的影响

正式设计文档应避免写入 Supabase 或其他业务应用的详细表结构。

可以保留概念边界：

```text
Business App Local User Mapping
Business App Local Authorization
Business App Local Data Access Control
```

但不展开为具体应用内部 DDL。

## 17. 业务应用侧准入校验边界

### 已确认决定

业务应用本体只负责业务自身的权限逻辑。

平台应用准入校验由应用接入层完成。

应用接入层可以是：

- 业务应用自己的 auth middleware。
- 业务应用 BFF。
- 统一网关。
- 平台提供的 connector / adapter。

### 边界说明

平台应用准入回答：

```text
当前用户是否允许进入这个业务应用？
```

业务应用权限回答：

```text
当前用户进入本应用后，可以执行哪些业务动作？
可以访问哪些业务资源？
可以访问哪些数据？
```

业务应用本体不需要理解：

- `application_assignments`。
- `projection_status`。
- 平台组织成员关系。
- Platform Admin RBAC。
- 跨应用角色模板。
- 平台权限中心内部模型。

### 接入层校验

应用接入层负责校验：

```text
token 是否有效
token 是否发给本应用
token 是否包含本应用准入信号
用户是否已被平台撤销本应用准入
```

常规情况下，准入信号来自 Keycloak Client Role。

目标态中，业务应用接入层必须把当前应用的 Keycloak Client Role 作为标准准入信号。

每个接入应用在平台注册时必须明确：

```text
applications.keycloak_client_id
applications.access_client_role
```

示例：

```text
applications.keycloak_client_id = app-a-web
applications.access_client_role = app_a_access
```

用户获得应用 A 准入后：

```text
Portal/Authz DB
  application_assignments
    Alice -> app_a active

Keycloak
  client: app-a-web
  role: app_a_access
  user: Alice
```

业务应用 A 的接入层必须校验：

```text
JWT signature 有效
iss 为正确 Keycloak realm
aud / azp 指向当前应用
exp 未过期
sub 存在
resource_access[applications.keycloak_client_id].roles 包含 applications.access_client_role
```

如果 token 没有当前应用的准入 Client Role，即使用户已经登录 Keycloak，也不能进入该业务应用。

错误语义：

```text
无 token / token 无效 / token 过期
  -> 401 UNAUTHENTICATED

token 有效，但缺少当前应用准入 Client Role
  -> 403 APP_ACCESS_DENIED
```

如果撤权延迟风险较高，接入层可以结合：

- 短 access token TTL。
- 本地准入缓存。
- `access.application.revoked` 事件。
- 平台准入查询 API。

平台准入查询 API 或业务应用本地准入缓存只作为加强拒绝和撤权兜底，不作为绕过 Keycloak Client Role 的放行依据。

也就是说：

```text
允许进入：
  必须 token 中具备当前应用 Client Role

拒绝进入：
  token 缺少当前应用 Client Role
  或本地准入缓存 / 平台准入查询显示该用户已被撤权
```

这样可以避免在 Keycloak Client Role 投影失败时，业务应用绕过认证侧准入投影直接放行用户。

对于高敏应用，推荐同时校验：

```text
1. token 中具备当前应用 Client Role
2. 本地准入缓存或平台准入查询未显示 revoked / disabled
```

这用于处理“用户手上的旧 access token 尚未过期，但平台已撤权”的延迟窗口。

### 业务应用本体职责

通过接入层准入校验后，业务应用本体只处理自身业务权限，例如：

- 能否审批订单。
- 能否查看某个客户。
- 能否导出报表。
- 能否访问某条业务数据。
- Supabase 应用中的 RLS 或本地业务权限判断。

这些业务权限不由统一身份平台接管。

### 业务角色分配编排边界

统一门户可以作为业务应用角色分配的统一入口，但业务应用仍然是业务角色事实源。

目标态采用以下边界：

```text
Keycloak
  - 登录身份
  - 管理后台入口角色
  - 应用准入 Client Role 投影

Portal/Authz
  - 应用准入事实源
  - 统一业务角色分配入口
  - connector 调用
  - 投影状态
  - 审计
  - 失败重试和对账

Business App
  - 业务角色事实源
  - 业务权限执行源
```

管理员可以在统一门户中完成以下操作：

```text
给 Alice 开通业务应用 A
并请求分配业务应用 A 的业务角色 finance_reviewer
```

但平台和业务应用保存的事实不同：

```text
Portal/Authz DB
  application_assignments
    Alice -> app_a active

  business_role_provisioning_requests / projection records
    Alice -> app_a:finance_reviewer
    status = pending | synced | failed

Business App A DB
  app_user_roles
    Alice local_user_id -> finance_reviewer
```

平台记录的是“业务角色分配请求、connector 执行结果、投影状态、审计和对账线索”。

业务应用记录的是“用户真实拥有哪些业务角色”，并继续负责这些角色对应的业务权限判断。

因此统一门户可以提供统一管理体验，但不能直接成为所有业务应用的业务权限数据库。

### 推荐编排流程

```text
管理员提交应用准入和业务角色分配
  -> 写 application_assignments
  -> 投影 Keycloak Client Role
  -> 调用业务应用 connector 分配业务角色
  -> 业务应用写本地 app_user_roles
  -> 平台记录 projection status 和审计
  -> connector 失败时进入重试、告警、人工处理和对账
```

如果业务应用没有提供角色分配 connector，统一门户只管理应用准入。业务角色由该业务应用自己的管理后台维护。

### 设计原则

- 统一门户可以编排业务角色分配，但不拥有业务角色事实。
- 业务应用必须提供明确的角色分配 API、connector 或 adapter，平台才能在统一门户中管理该应用的业务角色。
- 平台侧的角色模板、默认角色、推荐角色和分配请求只是投影输入或编排记录，不是最终授权事实。
- 业务权限判断始终由业务应用在自己的后端、RLS 或授权服务中执行。
- 高权限业务角色分配必须记录审计，并按业务应用风险策略支持审批、二次确认、重试和对账。

## 18. Keycloak 入口角色与 Platform Admin RBAC 边界

### 已确认决定

Keycloak 只保留少量管理后台入口和恢复角色。

Platform Admin RBAC 是日常管理后台权限事实源。

```text
admin_console_access
  -> 普通后台入口门禁

platform_admin
  -> 平台最高管理员种子身份
  -> 自动映射本地内置 platform_admin

break_glass_admin
  -> 紧急恢复身份
  -> 只用于恢复和修复

Platform Admin RBAC
  -> 日常管理权限事实源
```

### admin_console_access

`admin_console_access` 是所有能进入管理后台的用户都应具备的 Keycloak Realm Role。

它只表达：

```text
允许进入管理后台入口
```

它不表达：

- 能管理用户。
- 能授权应用。
- 能查看审计。
- 能管理角色。
- 能执行高风险操作。

有 `admin_console_access` 只能进入后台壳。具体能看什么、能做什么，由 Platform Admin RBAC 决定。

### platform_admin

`platform_admin` 是平台最高管理员种子身份。

Keycloak `platform_admin` 自动映射到 Platform Admin RBAC 的本地内置 `platform_admin` 角色。

本地内置 `platform_admin` 拥有所有管理权限。

限制：

- 只用于平台最高管理员。
- 人数必须极少。
- 必须强 MFA。
- 所有高风险操作必须写审计。
- 不用于普通后台用户授权。

该映射用于初始部署、权限修复和最高管理员访问路径，避免本地 RBAC 配置损坏后无法恢复。

### break_glass_admin

`break_glass_admin` 是紧急恢复身份，不参与日常授权。

用途：

- 本地 RBAC 数据损坏。
- 平台管理员全部误删。
- 权限配置导致无人能管理。
- 紧急安全事件处理。

限制：

- 必须强 MFA。
- 必须限制 IP 或 VPN。
- 默认禁用或仅极少数账号持有。
- 每次使用必须告警。
- 所有操作必须高风险审计。
- 建议双人审批或事后复核。

`break_glass_admin` 可以绕过本地 RBAC，但只能访问恢复/修复类能力：

- 重建内置角色。
- 授予或恢复 `platform_admin`。
- 修复 `admin_user_roles`。
- 查看必要审计。
- 撤销错误授权。

它不能用于日常用户管理、应用授权、审计导出等普通操作。

### API 鉴权规则

管理 API 的鉴权规则：

```text
if has break_glass_admin:
    allow only recovery permissions
    force MFA/recent login
    write high-risk audit
    trigger alert

else:
    require admin_console_access or platform_admin
    load Platform Admin RBAC
    if has Keycloak platform_admin:
        merge built-in platform_admin permissions
    check permission
    check scope
```

### 内置本地角色

Platform Admin RBAC 内置角色：

```text
platform_admin
user_admin
app_admin
auditor
support
```

这些是平台本地角色，不都放到 Keycloak。

Keycloak 只保留：

```text
admin_console_access
platform_admin
break_glass_admin
```

## 19. Outbox、Audit、Webhook 日志关联规则

### 已确认决定

`request_id` 标识一次入口请求。

`trace_id` 串联完整异步链路。

`operation_id` 标识一次管理业务操作。

`audit_logs`、`outbox_events`、`webhook_deliveries` 必须同时保存 `trace_id` 和 `operation_id`。

异步重试继承原始 `trace_id` 和 `operation_id`，但生成自己的 `request_id` 或 `job_run_id`。

字段命名约定：

```text
数据库字段
  -> snake_case
  -> request_id / trace_id / operation_id / event_id

API / MQ / Webhook JSON payload
  -> camelCase
  -> requestId / traceId / operationId / eventId
```

正式文档、OpenAPI、DDL、MQ payload 和 Webhook payload 必须按该约定统一命名。

### ID 语义

```text
request_id
  - 每次 HTTP/API 请求生成
  - 用于定位一次入口请求日志
  - 返回给前端
  - 写入 API response

trace_id
  - 每次管理业务操作生成
  - 串联 audit intent、audit result、outbox event、MQ message、webhook delivery、worker log
  - 异步任务必须继承原 trace_id

operation_id
  - 每次管理业务操作生成
  - 表示一次稳定业务操作，例如禁用用户、撤销应用准入
  - 用于排障 UI 聚合操作链路

event_id
  - 每个 outbox event 生成
  - 是 MQ consumer、webhook receiver 和 connector 的幂等键
  - 同一 event 重试、重新投递或 webhook 重试必须保持 event_id 不变
```

多数同步管理操作中，`request_id` 和 `trace_id` 可以相同。异步重试、Webhook 投递和对账修复必须继续沿用原始 `trace_id` 和 `operation_id`。

职责边界：

```text
requestId
  -> 定位单次请求或单次尝试

traceId
  -> 串联完整异步链路

operationId
  -> 聚合一次稳定业务操作

eventId
  -> 事件幂等键
```

`requestId` 不能替代 `traceId` 或 `operationId`。异步重试、Webhook 投递和对账修复会产生新的 `requestId`，但必须继承原始 `traceId` 和 `operationId`。

### 事件 Payload 契约

MQ 与 Webhook 的事件 payload 使用 camelCase。

基准结构：

```json
{
  "eventId": "evt_123",
  "eventType": "access.application.revoked",
  "eventVersion": 1,
  "occurredAt": "2026-06-27T10:00:00Z",
  "traceId": "trc_123",
  "operationId": "op_123",
  "causationId": "aud_123",
  "correlationId": "trc_123",
  "actor": {},
  "target": {},
  "data": {}
}
```

要求：

- `eventId` 是事件幂等键。
- `eventVersion` 必须存在，用于事件契约演进。
- `traceId` 用于链路追踪。
- `operationId` 用于排障 UI 聚合同一业务操作。
- `causationId` 指向触发当前事件的审计记录或前序事件。
- `correlationId` 默认等于 `traceId`，用于跨系统日志平台聚合。
- `actor`、`target` 和 `data` 的结构由具体事件版本定义。

### 管理写操作顺序

管理写操作按以下顺序处理：

```text
1. 生成 request_id、trace_id、operation_id
2. 校验登录、RBAC、scope、风险策略
3. 写 audit intent
4. 执行业务操作 / 调用 Keycloak / 更新平台事实表
5. 在同一事务内写 outbox_events
6. 写 audit result
7. 返回 API response
8. outbox dispatcher 发布 MQ
9. worker / webhook 继承 trace_id 和 operation_id
```

涉及平台数据库事实变更时，事实表、outbox event 和 audit result 必须在同一数据库事务中写入。

示例：

```text
transaction:
  update application_assignments
  insert outbox_events(trace_id, operation_id)
  insert audit_logs(result, trace_id, operation_id)
commit
```

### 表字段

```text
audit_logs
  - id
  - request_id
  - trace_id
  - operation_id
  - audit_phase     intent | result
  - result          pending | success | failed | partial

outbox_events
  - id
  - trace_id
  - operation_id
  - causation_id
  - correlation_id

webhook_deliveries
  - id
  - event_id
  - trace_id
  - operation_id
  - delivery_attempt
  - request_id
```

`causation_id` 指向触发当前事件的审计记录或前序事件。

`correlation_id` 默认等于 `trace_id`，用于跨系统日志平台聚合。

### 部分成功语义

部分成功必须写入 audit result。

示例：Keycloak disable 成功，但 outbox 写入或投影失败。

```text
audit intent = success
Keycloak disable = success
platform mirror/outbox = failed
audit result = partial
result_detail = KEYCLOAK_DISABLED_OUTBOX_FAILED
```

如果 outbox 和 audit result 在同一 DB 事务中失败，应用日志必须记录同一个 `trace_id`，并触发告警。

### Webhook 重试语义

Webhook 每次投递有自己的 HTTP `request_id`，但必须继承原始 `trace_id` 和 `operation_id`。

```text
webhook_delivery.id = whd_001
webhook_delivery.trace_id = trc_abc
webhook_delivery.operation_id = op_disable_user_001
webhook_delivery.delivery_attempt = 3
webhook_delivery.request_id = req_webhook_003
```

### 排障视图

目标态支持内部排障视图：

```text
GET /api/admin/operations/{operationId}
```

返回同一操作链路中的：

- audit intent。
- audit result。
- outbox events。
- MQ publish attempts。
- webhook deliveries。
- worker attempts。
- reconciliation records。

## 20. PostgreSQL / KingbaseES 兼容策略

### 已确认决定

统一身份平台主数据库默认使用 PostgreSQL。

国产化兼容目标为 KingbaseES PostgreSQL 兼容模式。

数据库 schema、migration、repository/query service 和集成测试必须按 PostgreSQL + KingbaseES 兼容目标设计。

### 数据访问层策略

应用代码必须通过 repository 或 query service 访问数据库。

数据库访问层是隔离 SQL 方言差异、错误码差异、分页差异、时间类型映射、JSON 字段读写差异的唯一位置。

前端组件、页面模块、Keycloak adapter、MQ adapter、Webhook adapter 不得直接访问数据库。

### 工具选择

数据访问工具优先选择 SQL-first / query-builder-first 方案，例如：

- Kysely。
- Drizzle。
- 原生 SQL。

Prisma 可以作为候选工具，但不作为目标设计的强约束。若使用 Prisma，必须单独验证：

- migration 在 KingbaseES PostgreSQL 兼容模式下的可执行性。
- 生成 SQL 的兼容性。
- driver、introspection、schema diff 的行为。
- 唯一约束、事务、分页、JSON 字段读写的兼容性。

### Migration 策略

所有数据库变更必须通过 migration 管理。

Migration 的最终提交物必须是可审查、可回放、可在 PostgreSQL 和 KingbaseES 上验证的 SQL。

ORM 或 schema 工具可以辅助生成 migration，但不能替代对最终 SQL 的审查。

每个 migration 必须考虑：

- PostgreSQL 执行结果。
- KingbaseES PostgreSQL 兼容模式执行结果。
- 回滚策略。
- 大表变更风险。
- 索引创建对写入的影响。
- 失败后的恢复方式。

### PostgreSQL 能力使用边界

允许使用：

- 标准事务。
- 主键、外键、唯一约束。
- 普通 B-tree 索引。
- 明确的 check constraint。
- `timestamp with time zone` 或等价时间类型。
- JSON/JSONB 作为非核心扩展字段。
- `SELECT ... FOR UPDATE` 等明确行锁语义。

谨慎使用，使用前必须记录兼容性验证结论：

- PostgreSQL extension。
- trigger。
- stored procedure。
- advisory lock。
- LISTEN/NOTIFY。
- partial index。
- expression index。
- 复杂 JSONB 查询和索引。
- 强依赖 PostgreSQL 系统表的逻辑。

禁止作为核心设计依赖：

- 用数据库函数承载核心业务流程。
- 用数据库特有扩展承载核心授权逻辑。
- 用 RLS 承载统一身份平台的核心授权判断。
- 依赖不可迁移的 PostgreSQL 隐式行为。
- 将跨系统同步语义绑定到数据库私有事件机制。

### JSON/JSONB 使用约束

JSON/JSONB 仅用于 `metadata` 等扩展字段。

以下字段必须结构化建模：

- 身份主键。
- 用户状态。
- 应用准入状态。
- 投影状态。
- 组织成员关系。
- 管理后台权限。
- 审计关键字段。
- outbox 事件状态。

JSON/JSONB 字段不得作为权限判断、审计追踪、同步状态机的唯一数据来源。

### 兼容性验证要求

Repository 集成测试至少覆盖：

- 唯一约束冲突。
- 事务提交与回滚。
- 分页。
- 时间类型读写。
- 行锁。
- JSON/JSONB 字段读写。
- 常用查询组合。

正式进入国产化部署或信创交付前，必须在 KingbaseES PostgreSQL 兼容模式下验证：

- 完整 migration 链路。
- repository 集成测试。
- 管理写操作关键路径。
- outbox 写入和派发状态查询。
- audit 写入和查询。
- 大表索引创建与回滚策略。

## 21. MQ Adapter 最小接口契约

### 已确认决定

MQ adapter 只抽象可靠传输，不抽象业务事件事实，不承载业务重试状态机，不暴露 RabbitMQ 专有模型。

Outbox DB 是事件事实源。

MQ 是平台内部异步传输层。

Adapter 契约必须支持 RabbitMQ 优先实现，同时允许替换为国产化/信创 MQ。

### 最小接口

MQ adapter 最小接口包含：

```ts
interface MessageBusAdapter {
  publish(message: PublishMessage): Promise<PublishResult>;

  consume(
    subscription: Subscription,
    handler: MessageHandler
  ): Promise<ConsumerHandle>;

  ack(delivery: MessageDelivery): Promise<void>;

  nack(
    delivery: MessageDelivery,
    options: NackOptions
  ): Promise<void>;

  healthCheck(): Promise<HealthStatus>;

  close(): Promise<void>;
}
```

最小契约不包含以下业务级能力：

- `retry`。
- `deadLetter`。
- `delay`。
- `transaction`。
- `exactlyOnce`。
- `globalOrdering`。

这些能力由 Outbox、dead letter 表、retry job、consumer 幂等和 reconciliation 承担。

### 消息模型

Adapter 暴露平台逻辑消息，不向上层暴露 exchange、queue、routing key、tag、subject 等具体 MQ 产品概念。

```ts
type PublishMessage = {
  topic: string;
  eventId: string;
  eventType: string;
  payload: unknown;
  occurredAt: string;
  traceId: string;
  operationId?: string;
  correlationId?: string;
  causationId?: string;
  headers?: Record<string, string>;
};
```

平台逻辑主题示例：

```text
identity.events
access.events
permission.events
audit.events
webhook.delivery
connector.projection
```

RabbitMQ 实现可以在 adapter 内部把 `topic` 映射为 exchange、routing key 和 queue。

国产 MQ 实现可以在 adapter 内部把 `topic` 映射为对应产品的 topic、tag、subject 或 queue。

### 重试和死信边界

延迟重试由 Outbox/DB 调度字段主导，不依赖 MQ 原生延迟队列。

发布失败时：

- 更新 `outbox_events.status`。
- 增加 `retry_count`。
- 设置 `next_retry_at`。
- 由 retry job 后续重新发布。

消费失败时：

- handler 记录处理失败。
- 根据失败类型更新处理状态或写入 dead letter 表。
- `nack` 只表达当前投递未成功，不承载业务重试策略。

MQ 原生 DLQ 可以开启，但只作为运维隔离能力，不作为业务事实源。

### 投递语义

MQ adapter 统一承诺 at-least-once delivery。

消费者必须按以下维度实现幂等：

```text
event_id + consumer
```

系统不承诺 exactly-once。

系统不承诺全局顺序。

同一 topic 内可以尽量按发布时间投递，但业务正确性不得依赖 MQ 顺序。

撤权、禁用等高风险操作的最终正确性依赖：

- Outbox fact。
- idempotent consumer。
- projection status。
- retry job。
- reconciliation。

不依赖 MQ 顺序或 MQ exactly-once。

### 国产化 MQ 替换验证

替换为国产化/信创 MQ 前，必须通过 POC 验证以下语义：

- 持久化消息发布确认。
- 消费 `ack` 后不再重复投递。
- 消费失败后不会形成无限热循环。
- 服务重启后未确认消息可恢复。
- 重复投递可被 `event_id` 幂等吸收。
- 消费端横向扩容时，同一 subscription 不会破坏幂等处理。
- 积压、失败、DLQ 可观测。
- `eventId`、`traceId`、`operationId` 能完整传递。
- 大消息限制明确，超过限制时 payload 不直接放入 MQ，而使用引用 ID。
- 网络中断、MQ 重启、消费者崩溃后，Outbox + MQ + retry 能恢复。

## 22. 用户删除、注销和匿名化策略

### 已确认决定

用户删除和注销不是单一实时物理删除动作，而是一组有顺序、有审计、有保留约束的生命周期操作。

默认策略为：

```text
disable + deprovision + anonymize
```

物理 `delete` 只作为受控的合规清理动作，不作为普通管理后台实时操作。

用户删除/注销的完成标准不是 Keycloak delete 成功，而是：

- 用户不可登录。
- 用户不可访问已撤销应用。
- 平台应用准入已撤销。
- 业务应用投影已通知或进入可审计失败重试状态。
- PII 已按策略删除或匿名化。
- 审计链路仍可追溯。

### 生命周期状态

平台用户生命周期状态包含：

```text
active
disabled
deprovisioning
deprovisioned
deletion_requested
anonymized
deleted
```

状态语义：

- `active`：用户可登录，准入和投影按授权状态生效。
- `disabled`：用户已禁止登录，必须以 Keycloak disable 成功为准。
- `deprovisioning`：正在回收应用准入、Keycloak Client Role、业务应用投影和会话。
- `deprovisioned`：平台准入和主要投影回收完成。
- `deletion_requested`：进入删除/注销处理流程，但仍可能受审计、法定保留、争议处理或安全调查约束。
- `anonymized`：PII 已删除或不可逆脱敏，但保留非 PII 的审计与关联占位。
- `deleted`：Keycloak 用户和平台可删除资料完成物理删除。

### 物理删除边界

只有以下场景允许物理删除 Keycloak 用户：

- 测试用户或误创建用户，确认没有有效业务使用和审计价值。
- 用户注销或删除请求已完成审批，且没有未届满的法定保留、审计保留、争议处理或安全调查要求。
- 已完成 deprovision，所有应用准入已撤销，业务投影已通知或进入可审计失败状态。
- 已保留必要的 tombstone 或 anonymized subject reference，保证审计事件不悬空。

普通管理员不得直接物理删除用户。

物理删除必须作为高风险操作处理，要求：

- `break_glass_admin` 或专门 `data_erasure_admin` 权限。
- 二次确认。
- 审批或工单号。
- audit intent。
- audit result。
- 异步任务执行。
- 删除前置检查可回滚，删除动作本身不可回滚。

### 数据分类和处理方式

用户相关数据分为三类：

```text
A. 身份认证资料
B. 平台授权/准入资料
C. 审计与安全资料
```

身份认证资料包括姓名、邮箱、手机号、头像、外部账号绑定等。注销或删除流程完成后，应删除或匿名化。

平台授权/准入资料包括应用准入、组织映射、角色投影等。注销或删除流程中必须撤销或标记历史失效。

审计与安全资料不得简单删除，否则会破坏审计链路。平台应保留必要追溯字段，并去除长期保存的直接 PII。

审计记录中建议长期保留：

```text
subject_id
subject_hash
anonymized_display
operation_id
trace_id
action
result
occurred_at
actor_type
```

`anonymized_display` 对已注销或匿名化用户使用固定值，例如：

```text
deleted_user
```

`subject_hash` 使用服务端密钥 HMAC 生成，用于安全排障、合规调查和同一主体关联分析，但不直接暴露原始身份信息。

### 业务应用边界

统一身份平台不直接删除业务应用自己的业务数据。

平台负责：

- 禁止登录。
- 撤销应用准入。
- 移除 Keycloak Client Role。
- 发布 `identity.user.deprovisioned`、`identity.user.anonymized`、`identity.user.deleted` 等事件。
- 记录业务应用 connector/webhook 的处理状态。
- 对失败投影重试、告警和对账。

业务应用负责：

- 本地用户映射处理。
- 业务角色和资源权限回收。
- 订单、文档、审批记录、项目成员历史等业务数据的保留、转移、匿名化或删除。
- 业务审计保留。

### 完成标准

用户注销/删除流程完成必须满足：

```text
Keycloak disabled = success
sessions revoked = success
application assignments revoked = success
Keycloak client roles removed = success
business projections notified or tracked = success/failed_with_retry
PII deleted/anonymized = success
audit result written = success
retention/tombstone policy satisfied = success
```

如果业务应用投影失败，不得宣称业务应用侧删除完成；必须进入重试、告警和对账。

如果法定保存期限未届满、审计保留未届满、存在争议处理或安全调查要求，平台不得物理删除必要记录，只能停止除存储和必要安全保护之外的处理，并执行匿名化或访问限制策略。

### 合规保留原则

个人信息保存期限按实现处理目的所必要的最短时间设计。

当用户注销、处理目的已实现、保存期限届满或其他删除条件成立时，平台应删除或匿名化个人信息。

如果存在法定保存、审计保留或技术上难以删除的情形，平台应停止除存储和必要安全保护之外的处理。

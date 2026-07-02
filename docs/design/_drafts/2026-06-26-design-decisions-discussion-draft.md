# 统一身份平台设计决策讨论稿

> 临时讨论稿，用于记录设计评审中已经确认的目标态决策和待继续固化的问题。
> 本文不是实施方案，不描述分阶段落地计划。

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

### 对现有文档的影响

现有文档中“同步到 Keycloak Group 或 Client Role”的表达应改为：

```text
应用准入默认同步到 Keycloak Client Role。
Group 可作为批量授权输入，但不是准入事实源。
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
  - 审计

Business Applications
  - 本地用户映射
  - 本应用业务角色
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

## 17. 待继续确认的问题

以下问题尚未固化，后续讨论后继续补充到本文：

1. Keycloak Client Role 投影在业务应用侧的校验方式。
2. `platform_admin`、`admin_console_access`、`break_glass_admin` 与 Platform Admin RBAC 的精确边界。
3. Outbox 事件、审计日志、Webhook 投递日志之间的 `request_id` / `trace_id` 关联规则。
4. PostgreSQL 与 KingbaseES 兼容 SQL 子集、ORM/query builder 和 migration 工具选择。
5. MQ adapter 最小接口契约。
6. 用户删除、注销、匿名化、审计保留和业务数据关联处理策略。

## 18. 新发现的待讨论点

### 18.1 Keycloak Client Role 投影校验方式

已确认应用准入投影到 Keycloak Client Role，但还需要明确业务应用如何消费该投影。

待讨论问题：

- 业务应用是否统一校验 `resource_access[client_id].roles`。
- 是否需要平台提供 introspection 或准入查询 API 作为兜底。
- 当 access token 中没有目标应用 role 时，业务应用应返回什么错误。
- 多应用、多 audience、多 client 场景下如何避免误读其他 client 的 role。

### 18.2 Keycloak 入口角色与 Platform Admin RBAC 边界

已确认 Keycloak Realm Role 只做入口门禁，Platform Admin RBAC 是管理后台细粒度权限事实源。

待讨论问题：

- `platform_admin` 是否只是入口/种子角色，还是默认映射到本地超级管理员。
- `admin_console_access` 是否作为所有后台用户的统一入口角色。
- `break_glass_admin` 的生效条件、操作范围、告警和审计规则。
- 本地 RBAC 数据损坏时如何恢复首个管理员。

### 18.3 Outbox、Audit、Webhook 日志关联

已确认 `audit_logs` 是审计权威存储，`outbox_events` 是事件事实源，`webhook_deliveries` 是外部投递日志。

待讨论问题：

- 同一管理操作如何生成并传递 `request_id` 和 `trace_id`。
- audit intent、audit result、outbox event、webhook delivery 如何互相引用。
- 部分成功场景如何表达，例如 Keycloak 操作成功但 outbox 派发失败。
- 排障 UI 是否需要按 `trace_id` 展示完整操作链路。

### 18.4 PostgreSQL / KingbaseES 兼容 SQL 子集

已确认主数据库使用 PostgreSQL，并兼容 KingbaseES PostgreSQL 兼容模式。

待讨论问题：

- ORM、query builder、migration 工具如何选择。
- JSONB、partial index、expression index、trigger、stored procedure 的使用边界。
- timestamp、分页、唯一约束错误码、事务锁在 KingbaseES 上的兼容验证方式。
- 是否需要为 PostgreSQL 和 KingbaseES 各跑一套 repository 集成测试。

### 18.5 MQ Adapter 最小接口契约

已确认常规部署优先 RabbitMQ Quorum Queue，并通过 MQ adapter 兼容国产化 MQ。

待讨论问题：

- adapter 最小接口是否包含 `publish`、`subscribe`、`ack`、`nack`、`retry`、`deadLetter`。
- 延迟重试由 MQ 原生能力实现，还是由数据库调度字段实现。
- consumer group、routing key、exchange/topic 的抽象如何定义。
- 替换国产 MQ 时哪些语义必须通过 POC 验证。

### 18.6 用户删除、注销和匿名化策略

已确认用户生命周期拆成 `disable / deprovision / delete`。

待讨论问题：

- 什么场景允许物理删除 Keycloak 用户。
- 什么场景只做禁用和去供应。
- 用户个人信息是否需要匿名化。
- 业务数据关联如何保留。
- 审计日志中的个人信息如何脱敏但保持可追溯。
- 删除、匿名化和审计保留周期之间如何协调。

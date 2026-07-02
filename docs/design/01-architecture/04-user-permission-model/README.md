# 04. 用户与权限模型设计

## 1. 目标

本文定义统一身份、应用准入、业务权限和本地用户映射模型。

核心原则：

```text
Keycloak 管身份
平台管应用准入、应用角色分配和跨应用共享授权事实
应用域管角色权限定义和业务权限执行
```

## 2. 身份主键

跨系统统一身份键使用 Keycloak `sub`。

```text
keycloak_sub = 全局身份 ID
```

不要使用 email 作为主身份键。email 可变、可重复、可迁移。

`keycloak_user_id` 是 Keycloak Admin API 操作用的技术标识，可以保存在 `portal_users` 中，但不能作为跨系统身份键，也不能作为审计和事件 payload 的主身份字段。

`keycloak_sub` 和 `keycloak_user_id` 的值在某些 Keycloak 配置中可能相同，但语义不同，设计不能依赖二者永远相等。

## 3. 身份映射关系

```text
Keycloak User
  sub
  email
  enabled

Portal User
  id
  keycloak_sub

Business App User
  local_user_id
  keycloak_sub

Business App Local Identity
  local_identity_id
  keycloak_sub
```

说明：

- Keycloak User 是认证身份源，负责登录、密码、多因素认证、账号状态和令牌签发。
- Portal User 是统一身份平台的用户总表，用于管理后台展示、平台授权关系、同步状态和审计关联。
- 所有被统一身份平台管理的用户都应在 `portal_users` 中有一条记录，包括只使用业务应用的用户、可以进入管理后台的用户、以及同时具备两类身份的用户。
- Portal User 不是第二套登录账号，不保存密码，也不作为认证源。
- Portal User 必须通过 `keycloak_sub` 关联到 Keycloak User。

## 4. 核心实体

| 实体 | 所属边界 | 说明 |
|---|---|---|
| Keycloak User | Keycloak | 身份源用户 |
| portal_users | 门户 | 统一身份平台用户总表 |
| registration_requests | 门户 | 用户注册申请与审批记录 |
| applications | 平台 | 已接入业务应用 |
| application_assignments | 平台 | 用户可访问哪些应用 |
| application_roles | 平台 | 某个业务应用可分配的角色目录 |
| application_user_roles | 平台 | 用户在某个业务应用中的角色分配 |
| platform_tenants | 平台 | 可选的租户目录，用于客户边界或数据隔离边界 |
| platform_tenant_members | 平台 | 可选的用户与租户关系 |
| platform_organizations | 平台 | 平台组织目录 |
| platform_organization_members | 平台 | 用户与平台组织关系 |
| business_app_organization_mappings | 平台 | 平台组织与业务应用组织映射 |
| admin_roles / admin_permissions | 平台 | 管理后台权限事实源 |
| app_users | 应用域 | 应用本地用户 |
| app_permissions | 应用域 | 应用权限 |
| app_role_permissions | 应用域 | 应用角色到具体权限的映射 |

## 5. 平台用户总表

```sql
portal_users
- id
- keycloak_sub
- keycloak_user_id
- email
- display_name
- status
- sync_status
- metadata
- created_at
- updated_at
```

`metadata` 用于扩展展示信息，不存核心权限。

`portal_users` 是平台侧的总用户表，不保存密码，不作为认证源。平台侧的管理后台角色、应用准入、业务应用角色分配都通过 `portal_user_id` 关联到这张表。

`keycloak_sub` 必须唯一且非空。`keycloak_user_id` 可以为空，用于尚未完成 Keycloak Admin API 对账的本地镜像用户。

用户角色身份的存储方式：

| 用户身份/关系 | 角色定义存储 | 用户绑定存储 |
|---|---|---|
| 可以进入管理后台入口 | Keycloak 全局角色，例如 `admin_console_access` | Keycloak 用户角色绑定，同时用户存在于 `portal_users` |
| 管理后台本地角色 | `admin_roles.code` | `admin_user_roles.portal_user_id` |
| 可以进入某个业务应用 | `applications` | `application_assignments.portal_user_id` |
| 在某个业务应用中是什么角色 | `application_roles.code` | `application_user_roles.portal_user_id` |

其中 `portal_user_id` 是平台内部关系主键，`keycloak_sub` 是和 Keycloak、业务应用、事件 payload 对齐的跨系统身份键。

### 5.1 注册申请与审批记录

用户注册默认需要管理员审批。是否免审批可以作为平台配置项，但默认策略是 `approval_required = true`。

注册申请应独立保存，不放在 `portal_users.metadata` 中：

```sql
registration_requests
- id
- email
- display_name
- requested_organization_id
- requested_reason
- status
- approval_required
- portal_user_id
- keycloak_sub
- reviewed_by
- reviewed_at
- review_comment
- created_at
- updated_at
```

`status` 建议从以下值开始：

```text
pending
approved
rejected
cancelled
```

说明：

- `registration_requests` 是“用户注册是否通过审批”的事实记录。
- 审批通过后，平台创建或启用 Keycloak 用户，并确保 `portal_users` 中存在对应记录。
- `portal_user_id` 和 `keycloak_sub` 可以在审批通过并完成账号创建后回填。
- 审批拒绝不应创建可登录账号；如果已经创建了 Keycloak 用户，必须保持禁用或清理。
- 免审批模式等价于系统自动通过注册申请，但不等价于自动授予业务应用访问权限。
- 应用准入仍必须写入 `application_assignments`；应用角色仍必须写入 `application_user_roles`。

## 6. 组织、团队与租户模型

平台需要维护用户与组织关系，但不接管所有业务应用内部的组织、团队、项目和数据权限模型。

三个概念的边界如下：

| 概念 | 含义 | 平台是否维护 | 说明 |
|---|---|---|---|
| 租户 Tenant | 客户、法人主体、数据隔离或计费边界 | 可选 | 只有存在明确多租户隔离、客户边界或计费边界时才启用 |
| 组织 Organization | 公司、集团、部门、事业部等相对稳定的组织结构 | 是 | 用于管理后台授权范围、批量授权、应用准入范围和组织映射 |
| 团队 Team | 项目组、审核组、协作组等较灵活的工作单元 | 视场景 | 可以作为 `platform_organizations.type = team` 管理，也可以由业务应用自治 |
| 应用本地组织 | 某个业务应用内部的组织、团队、项目空间 | 否 | 业务应用维护，平台只保存映射关系 |

### 6.1 租户目录

租户不是默认必需模型。只有当平台需要表达客户边界、数据隔离边界、计费边界或独立管理边界时，才引入 `platform_tenants`。

```sql
platform_tenants
- id
- code
- name
- status
- metadata
- created_at
- updated_at
```

说明：

- `platform_tenants` 不替代 Keycloak realm。是否按租户拆 Keycloak realm 是部署和安全隔离问题，不能仅由业务字段决定。
- 如果暂时没有多租户隔离诉求，可以不启用租户表，只使用平台组织模型。
- 租户字段不能放在 `portal_users.metadata` 中作为核心授权依据。

如果启用租户模型，用户与租户关系需要结构化保存：

```sql
platform_tenant_members
- id
- tenant_id
- portal_user_id
- member_type
- status
- created_at
- updated_at
```

说明：

- 一个用户可以属于多个租户。
- 默认租户、最近访问租户等展示偏好可以放在用户偏好中，但不能替代 `platform_tenant_members` 作为授权依据。
- 租户成员关系本身不表示用户可以进入某个应用；应用准入仍必须写入 `application_assignments`。

### 6.2 平台组织目录

```sql
platform_organizations
- id
- tenant_id
- parent_id
- code
- name
- type
- status
- metadata
- created_at
- updated_at
```

`type` 建议从少量稳定枚举开始：

```text
company
department
business_unit
team
```

说明：

- `tenant_id` 在启用租户模型时使用；未启用租户时可以为空。
- `parent_id` 用于表达组织层级，例如公司、事业部、部门、团队。
- 团队如果只是业务应用内部概念，例如产品碳足迹数据库系统中的审核小组，可以留在业务应用内部；平台只在需要跨应用管理或批量授权时维护团队。
- 平台组织目录用于平台侧授权范围，不等于业务应用内部组织表。

### 6.3 用户组织成员关系

```sql
platform_organization_members
- id
- organization_id
- portal_user_id
- member_type
- status
- joined_at
- left_at
- created_at
- updated_at
```

`member_type` 建议从以下值开始：

```text
member
manager
owner
```

说明：

- 用户属于哪个组织，通过 `platform_organization_members.portal_user_id` 关联 `portal_users.id`。
- 组织成员关系可以作为管理后台权限 scope、应用角色 scope 和批量授权输入。
- 组织成员关系本身不表示用户可以进入某个应用；应用准入仍必须写入 `application_assignments`。
- 组织成员关系本身也不表示用户在应用中的业务角色；业务应用角色仍必须写入 `application_user_roles`。

### 6.4 业务应用组织映射

```sql
business_app_organization_mappings
- id
- platform_organization_id
- application_id
- business_app_org_id
- mapping_type
- status
- created_at
- updated_at
```

说明：

- 该表用于表达“平台组织”和“业务应用内部组织/团队/项目空间”的对应关系。
- 例如平台组织 `org_123` 可以映射到产品碳足迹数据库系统中的 `team_456`，也可以映射到排放因子库系统中的 `workspace_789`。
- 映射关系用于同步、回调、投影和对账，不要求业务应用改成本平台的组织表结构。

### 6.5 与角色范围的关系

应用角色分配中的 `scope_type` 和 `scope_id` 用于表达角色作用范围：

```text
global
tenant
org
team
project
```

示例：

```text
Alice 是产品碳足迹数据库系统在 org_123 下的数据审核员
Bob 是排放因子库系统在 team_456 下的排放因子编辑人员
Carol 是产品碳足迹数据库系统的全局系统管理员
```

边界原则：

- 平台负责保存“用户在哪个应用、哪个范围内是什么角色”。
- 业务应用负责定义该角色在该范围内能做什么，例如编辑、审核、团队管理、数据范围控制。
- 如果 `scope_type = org` 或 `team`，`scope_id` 应优先引用平台组织 ID；需要投影到业务应用时，通过 `business_app_organization_mappings` 转换为业务应用本地 ID。

## 7. 应用注册表

```sql
applications
- id
- code
- name
- keycloak_client_id
- status
- login_url
- admin_url
- metadata
- created_at
- updated_at
```

示例：

```text
crm
billing
data-platform
supabase-business-app
```

## 8. 应用准入表

```sql
application_assignments
- id
- application_id
- portal_user_id
- keycloak_sub
- status
- source
- expires_at
- projection_status
- last_projection_error
- projected_at
- business_projection_status
- last_business_projection_error
- business_projected_at
- created_at
- updated_at
```

说明：

- 表示用户是否可以进入某应用。
- `portal_user_id` 关联 `portal_users.id`，用于平台内部关系建模。
- `keycloak_sub` 用于事件 payload、业务应用投影和跨系统身份关联。
- 平台数据库中的记录是应用准入事实源。
- Keycloak Client Role 是认证侧准入投影。
- Keycloak Group 只用于组织、部门、批量管理和管理员分组，不作为最终准入事实源。
- 只表示用户是否可以进入应用，不表示用户在应用中的角色。

当平台准入事实写入成功，但 Keycloak 或业务应用投影失败时，不回滚 `application_assignments`。系统通过 `projection_status`、错误字段、重试、告警和对账处理投影失败。

## 9. 应用角色目录与角色分配

统一身份平台维护“用户在某个应用中是什么角色”，但不维护这些角色背后的具体业务权限。

不同类型角色的存储位置：

| 角色身份 | 示例 | 角色定义存储 | 用户绑定存储 |
|---|---|---|---|
| Keycloak 平台入口角色 | `admin_console_access`、`platform_admin` | Keycloak 全局角色 | Keycloak 用户角色绑定，同时用户必须存在于 `portal_users` |
| 管理后台本地角色 | `user_admin`、`app_admin`、`auditor`、`support` | `admin_roles.code` | `admin_user_roles.portal_user_id` |
| 业务应用角色 | `system_admin`、`data_reviewer`、`data_editor` | `application_roles.code` | `application_user_roles.portal_user_id` |

业务应用角色的用户分配关系存储在 `application_user_roles` 中，使用 `application_user_roles.application_role_id` 指向 `application_roles.id`。

### 9.1 应用角色目录

```sql
application_roles
- id
- application_id
- code
- name
- description
- status
- created_at
- updated_at
```

示例：

```text
产品碳足迹数据库系统：
- system_admin       系统管理员
- data_reviewer      数据审核员
- data_editor        数据编辑人员

排放因子库系统：
- system_admin       系统管理员
- factor_reviewer    排放因子审核员
- factor_editor      排放因子编辑人员
```

说明：

- `application_roles` 是平台可分配的应用角色目录。
- 角色 code 必须在同一应用内唯一。
- 角色目录可以由平台管理员配置，也可以由业务应用通过接入流程提供。
- 平台只保存角色 code、名称、描述和状态，不保存该角色具体能执行哪些业务动作。

### 9.2 用户应用角色分配

```sql
application_user_roles
- id
- application_id
- application_role_id
- portal_user_id
- keycloak_sub
- scope_type
- scope_id
- status
- source
- expires_at
- projection_status
- last_projection_error
- projected_at
- created_at
- updated_at
```

示例：

```text
Alice 在产品碳足迹数据库系统中是 data_reviewer
Bob 在产品碳足迹数据库系统中是 system_admin
Carol 在排放因子库系统中是 factor_editor
```

说明：

- `application_user_roles` 是“用户在某个应用中是什么角色”的平台事实源。
- `portal_user_id` 关联 `portal_users.id`，表示这条角色分配属于哪个平台用户。
- `keycloak_sub` 用于事件 payload、业务应用投影和跨系统身份关联。
- `scope_type` 和 `scope_id` 用于表达角色作用范围，例如 global、org、team、project。
- 角色分配变更需要通过事件、Webhook 或业务应用 connector 投影给业务应用。
- 业务应用可以保存本地角色分配投影，用于运行时权限判断和离线兜底。

## 10. 应用域权限模型

每个应用维护自己的角色权限定义和业务权限执行逻辑。

```sql
app_users
- id
- keycloak_sub
- email
- display_name
- status
- metadata

app_permissions
- id
- code
- description

app_role_permissions
- role_code
- permission_id
```

角色权限定义示例：

```text
产品碳足迹数据库系统：
- data_editor -> footprint.edit_draft
- data_reviewer -> footprint.review, footprint.reject
- system_admin -> team.manage, footprint.review, footprint.edit_draft

排放因子库系统：
- factor_editor -> emission_factor.edit_draft
- factor_reviewer -> emission_factor.review, emission_factor.publish
```

说明：

- 平台负责分配用户的应用角色。
- 业务应用负责定义角色对应哪些权限，并执行具体权限判断。
- 业务应用可以按自己的数据库结构保存权限定义，不要求与上面概念表完全一致。

## 11. 管理后台本地权限模型

管理后台权限使用平台本地权限模型，独立于 Keycloak 全局角色。Keycloak 只提供入口角色（`admin_console_access`）和种子身份（`platform_admin`），细粒度管理权限由管理后台本地权限模型承载。

### 11.1 权限结构

```typescript
interface AdminPermission {
  code: string           // 如 user:disable, app:assign, audit:view
  scopeType: 'global' | 'org' | 'app'
  scopeId?: string       // scopeType 为 org/app 时，对应的 ID
}

interface AdminRole {
  id: string
  code: string           // platform_admin, user_admin, app_admin, auditor, support
  name: string
  permissions: AdminPermission[]
}
```

### 11.2 权限检查函数

```typescript
/**
 * 检查管理员是否拥有指定权限
 * @param adminSub 管理员 keycloak_sub
 * @param permissionCode 权限代码，如 'user:disable'
 * @param scope 权限作用域，不传则检查是否有 global 权限
 * @returns 是否有权限
 */
function can(
  adminSub: string,
  permissionCode: string,
  scope?: { type: 'org' | 'app', id: string }
): boolean
```

### 11.3 权限继承规则

- `platform_admin` 自动拥有所有权限（内置超级管理员）。
- 有 global scope 权限的管理员，自动拥有所有 org 和 app scope 的同权限。
- 有 org scope 权限的管理员，自动拥有该 org 下所有 app scope 的同权限（如果有 org-app 层级关系）。

### 11.4 校验位置

- Route Handler 入口层：校验是否有入口权限。
- Service 层：校验具体资源的 scope 权限。
- UI 层：根据权限隐藏按钮（仅作体验优化，不作安全边界）。

### 11.5 内置角色

```text
platform_admin    平台超级管理员（内置，不可删除、不可修改权限）
user_admin        用户管理员（内置，不可删除，权限可调整）
app_admin         应用管理员（内置，不可删除，权限可调整）
auditor           审计员（内置，不可删除，权限可调整）
support           支持人员（内置，不可删除，权限可调整）
```

这些角色是管理后台本地角色，不放在 Keycloak 全局角色中。内置角色不可删除，但其权限绑定可以按组织实际需求调整。除内置角色外，管理员可以创建自定义角色并分配权限。

### 11.6 管理后台用户角色绑定

```sql
admin_user_roles
- id
- portal_user_id
- admin_role_id
- scope_type
- scope_id
- created_at
- updated_at
```

说明：

- `portal_user_id` 关联 `portal_users.id`。
- `admin_role_id` 关联 `admin_roles.id`。
- 管理后台用户也是 `portal_users` 中的用户镜像，不单独建立另一套管理员用户表。

## 12. Keycloak 中应该放什么

适合放：

```text
账号状态
MFA 状态
登录凭证
用户组
部门组
管理后台准入角色
应用准入 Client Role 投影
批量授权输入用户组
```

其中批量授权输入用户组只用于选择人群，不能作为应用准入事实源，也不能作为业务应用放行信号。应用准入事实必须写入 `application_assignments`，再投影为对应业务应用的 Keycloak Client Role。

不建议放：

```text
订单审批权限
文档删除权限
项目资源级权限
报表导出范围
业务数据行级权限
```

## 13. 业务应用权限模型边界

统一身份平台不详细设计 Supabase 或其他业务应用内部表结构。

业务应用内部可以维护自己的本地用户、组织、角色权限定义、RLS 或其他数据访问控制模型。

平台只要求业务应用能建立以下概念映射：

```text
keycloak_sub -> business_app_local_user_id
platform_org_id -> business_app_org_id
application_assignment_status -> business_app_access_projection
application_user_roles -> business_app_role_assignment_projection
```

Supabase 应用按业务应用处理。Supabase Auth、RLS、组织成员关系、角色权限定义和数据访问策略属于 Supabase 应用自身设计，不在统一身份平台模型中展开。

## 14. metadata 使用规则

可以放：

```text
头像
偏好设置
外部系统辅助 ID
最近同步时间
非关键展示属性
```

不能放：

```text
主身份键
核心状态
核心权限
组织成员关系
审计强相关字段
高频查询字段
```

## 15. 设计结论

统一的是身份、应用准入和应用角色分配，不是所有业务权限规则。

```text
keycloak_sub 统一识别用户
application_assignments 管应用入口
application_roles 管应用角色目录
application_user_roles 管用户在应用中的角色
Keycloak Client Role 承载认证侧准入投影
管理后台本地权限模型管管理后台权限
业务应用管角色权限定义和业务权限执行
```

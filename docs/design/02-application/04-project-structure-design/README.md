# 12. 项目结构设计

## 1. 目标

本文定义统一用户门户与管理后台项目的代码组织方式。

项目技术方向：

```text
Next.js App Router
Auth.js + Keycloak Provider
Keycloak Admin REST API
统一身份平台数据库
事件表 / 消息队列 / 回调通知 / 业务适配器
Supabase 作为业务应用样例之一
```

设计目标：

- 路由、页面、业务能力、服务端用例、基础设施适配分层清晰。
- Keycloak、数据库、平台权限中心、审计日志、MQ 和 Webhook 适配不散落在页面组件里。
- 管理后台 API 统一做鉴权、校验、权限判断、审计和错误处理。
- 部署、环境变量、脚本、运维 runbook 在项目初期就有固定位置。
- 可以在部署形态需要时拆分为独立 worker、平台权限中心或共享包。

## 2. 总体原则

本项目推荐采用：

```text
app/        负责路由入口
features/   负责前端业务模块
components/ 负责跨业务复用 UI
server/     负责服务端业务用例
lib/        负责基础设施适配
deploy/     负责部署与运维资产
```

其中 `features/` 可以保留，但不要把它做成“全栈业务模块”。在本项目里，`features/` 的定位是前端业务域模块，主要承载页面组件、表单、筛选、前端查询封装和展示状态。

核心边界：

- `app/` 不沉淀复杂业务逻辑。
- `features/` 不保存数据库连接、Keycloak Admin token、service account secret。
- `server/` 不依赖 React 组件。
- `lib/` 封装技术适配，但不承载完整业务流程。
- `deploy/`、`scripts/`、`docs/` 是项目的一等目录，不作为临时杂项目录。

## 3. 推荐目录结构

```text
identity-portal/
├─ app/
│  ├─ (public)/
│  │  ├─ login/
│  │  │  └─ page.tsx
│  │  ├─ register/
│  │  │  └─ page.tsx
│  │  └─ error/
│  │     └─ page.tsx
│  ├─ (account)/
│  │  └─ account/
│  │     ├─ page.tsx
│  │     ├─ security/
│  │     │  └─ page.tsx
│  │     ├─ sessions/
│  │     │  └─ page.tsx
│  │     └─ apps/
│  │        └─ page.tsx
│  ├─ (admin)/
│  │  └─ admin/
│  │     ├─ layout.tsx
│  │     ├─ page.tsx
│  │     ├─ users/
│  │     │  ├─ page.tsx
│  │     │  ├─ new/
│  │     │  │  └─ page.tsx
│  │     │  └─ [id]/
│  │     │     └─ page.tsx
│  │     ├─ organizations/
│  │     │  ├─ page.tsx
│  │     │  └─ [id]/
│  │     │     └─ page.tsx
│  │     ├─ applications/
│  │     │  ├─ page.tsx
│  │     │  └─ [id]/
│  │     │     └─ page.tsx
│  │     ├─ roles/
│  │     │  └─ page.tsx
│  │     ├─ audit/
│  │     │  └─ page.tsx
│  │     └─ settings/
│  │        └─ page.tsx
│  ├─ api/
│  │  ├─ auth/
│  │  │  └─ [...nextauth]/
│  │  │     └─ route.ts
│  │  ├─ admin/
│  │  │  ├─ users/
│  │  │  │  ├─ route.ts
│  │  │  │  └─ [id]/
│  │  │  │     ├─ route.ts
│  │  │  │     ├─ enable/
│  │  │  │     │  └─ route.ts
│  │  │  │     ├─ disable/
│  │  │  │     │  └─ route.ts
│  │  │  │     ├─ reset-password/
│  │  │  │     │  └─ route.ts
│  │  │  │     └─ reset-mfa/
│  │  │  │        └─ route.ts
│  │  │  ├─ organizations/
│  │  │  │  └─ route.ts
│  │  │  ├─ applications/
│  │  │  │  ├─ route.ts
│  │  │  │  └─ [id]/
│  │  │  │     ├─ route.ts
│  │  │  │     └─ assignments/
│  │  │  │        └─ route.ts
│  │  │  ├─ roles/
│  │  │  │  └─ route.ts
│  │  │  └─ audit-logs/
│  │  │     └─ route.ts
│  │  ├─ account/
│  │  │  ├─ profile/
│  │  │  │  └─ route.ts
│  │  │  └─ apps/
│  │  │     └─ route.ts
│  │  └─ health/
│  │     └─ route.ts
│  ├─ layout.tsx
│  ├─ page.tsx
│  ├─ not-found.tsx
│  └─ globals.css
├─ features/
│  ├─ users/
│  │  ├─ components/
│  │  ├─ hooks/
│  │  ├─ queries.ts
│  │  ├─ schemas.ts
│  │  └─ types.ts
│  ├─ organizations/
│  ├─ applications/
│  ├─ roles/
│  ├─ audit/
│  └─ account/
├─ components/
│  ├─ ui/
│  ├─ layout/
│  ├─ data-table/
│  ├─ forms/
│  └─ feedback/
├─ lib/
│  ├─ auth/
│  ├─ keycloak/
│  ├─ db/
│  ├─ audit/
│  ├─ mq/
│  ├─ permissions/
│  ├─ sync/
│  ├─ validation/
│  ├─ http/
│  └─ config/
├─ server/
│  ├─ services/
│  ├─ repositories/
│  ├─ policies/
│  └─ jobs/
├─ migrations/
├─ deploy/
│  ├─ docker/
│  ├─ k8s/
│  ├─ env/
│  └─ runbooks/
├─ scripts/
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  └─ e2e/
├─ types/
├─ docs/
├─ public/
├─ middleware.ts
├─ next.config.ts
├─ package.json
├─ tsconfig.json
└─ README.md
```

## 4. 分层说明

### 4.1 `app/`

`app/` 只放 Next.js 路由、布局、页面和 Route Handlers。

原则：

- 页面组件负责组合 UI、触发查询、处理跳转和加载状态。
- Route Handler 负责 HTTP 入站、鉴权、参数校验、调用服务层、返回响应。
- 不在 `route.ts` 中直接写复杂 Keycloak 调用、数据库查询和审计逻辑。
- 不把页面组件做成业务服务的承载点。

Next.js App Router 支持 route groups，例如 `(admin)`，不会影响 URL。也支持 private folders 和路由目录内共置文件，但本项目建议共享代码放在 `app/` 外部，避免路由目录越来越重。

### 4.2 `features/`

`features/` 按业务能力组织前端业务模块。

推荐形态：

```text
features/users/
├─ components/
│  ├─ user-table.tsx
│  ├─ user-form.tsx
│  ├─ user-detail-panel.tsx
│  └─ disable-user-dialog.tsx
├─ hooks/
│  └─ use-user-filters.ts
├─ queries.ts
├─ schemas.ts
└─ types.ts
```

适合放：

- 用户列表、用户详情、应用授权、组织管理等业务组件。
- 表单 schema、筛选条件、页面级查询封装。
- 前端展示状态和交互状态。
- 与 UI 强相关的轻量类型。

不放：

- Keycloak Admin token。
- 数据库连接。
- service account secret。
- 审计日志写入。
- 核心权限判断。
- 后台同步任务。

`features/` 的判断标准：

```text
如果代码主要服务于某个页面/业务域的展示和交互，可以放 features。
如果代码会访问 secret、数据库、Keycloak Admin API 或执行管理动作，应该放 server 或 lib。
```

#### 前端状态管理

- **服务端状态**：使用 **TanStack Query（React Query）**
  - 缓存、重新验证、乐观更新。
  - 与 Next.js Server Components 配合良好。
  - DevTools 便于调试。
- **表单状态**：使用 **React Hook Form + Zod**
  - 与 `features/*/schemas.ts` 中的 Zod schema 共享。
  - 性能好，包体积小。
- **全局客户端状态**：暂不引入 Redux 等重型状态管理库。
  - 管理后台的全局状态（如侧边栏折叠、主题）用 URL Search Params + Context 即可。

### 4.3 `components/`

`components/` 放跨功能复用组件。

```text
components/ui          基础 UI
components/layout      门户和后台布局组件
components/data-table  通用表格组件
components/forms       通用表单控件
components/feedback    Toast、Dialog、Empty State
```

原则：

- 通用组件不依赖具体业务域。
- 通用组件不直接请求业务 API。
- 业务专用组件优先放在 `features/*/components`。

### 4.4 `lib/`

`lib/` 放基础设施适配和通用工具。

```text
lib/auth        Auth.js 配置、session 获取、角色解析
lib/keycloak    Keycloak Admin API client、token client、类型转换
lib/db          数据库连接、事务工具
lib/audit       审计日志写入入口
lib/permissions 通用权限辅助函数
lib/sync        事件发布与同步工具
lib/validation  通用校验
lib/http        API 响应、错误码、requestId
lib/config      环境变量读取和校验
```

原则：

- `lib/` 可以被 `server/` 和 `app/api` 使用。
- `lib/` 不能依赖 React 组件。
- `lib/keycloak`、`lib/db`、`lib/audit` 默认只允许服务端使用。
- `lib/config` 是读取环境变量的唯一入口，业务代码不要到处读取 `process.env`。

### 4.5 `server/`

`server/` 放服务端业务用例层。

```text
server/services       业务服务
server/repositories   数据访问
server/policies       服务端权限策略
server/jobs           后台任务和同步任务
```

示例：

```text
server/services/user-service.ts
server/services/application-service.ts
server/repositories/portal-user-repository.ts
server/repositories/audit-log-repository.ts
server/policies/admin-policy.ts
server/jobs/reconcile-keycloak-users.ts
```

原则：

- Route Handler 调用 service。
- service 编排 repository、Keycloak client、audit、sync event。
- repository 只负责数据读写，不做权限判断。
- policy 负责服务端权限判断，不把权限逻辑散落在 UI 或 repository 中。

### 4.6 `migrations/` 和 `db/`

`migrations/` 放统一身份平台数据库的数据库迁移，`db/` 放 Drizzle ORM 的 schema 定义和数据库连接。

```text
db/
├─ schema/              # Drizzle schema 定义，按模块拆分
│  ├─ portal-users.ts
│  ├─ applications.ts
│  ├─ audit-logs.ts
│  └─ outbox-events.ts
├─ index.ts             # 数据库连接导出
└─ migrations/          # drizzle-kit 生成的迁移文件
   ├─ 0001_init.sql
   ├─ 0002_add_app_assignments.sql
   └─ 0003_add_audit_logs.sql
```

`drizzle-kit` 负责根据 `db/schema/` 生成和管理迁移文件。

Repository 层通过 `db/index.ts` 获取数据库连接，通过 `db/schema/` 获取类型定义。

迁移目录只管理统一门户自己的数据库，不管理 Keycloak 内部库，也不管理各业务系统数据库。

即使 Keycloak DB 与统一身份平台数据库共用同一数据库集群，也必须使用独立 database 或 schema owner、独立数据库账号和独立 migration 边界。平台代码不得直接读写 Keycloak 内部表。

### 4.7 `deploy/`

`deploy/` 放部署和运维相关资产。这个目录应从项目初期就保留，即使初始内容很少。

推荐结构：

```text
deploy/
├─ docker/
│  ├─ Dockerfile
│  └─ docker-compose.yml
├─ k8s/
│  ├─ deployment.yaml
│  ├─ service.yaml
│  ├─ ingress.yaml
│  └─ secret-template.yaml
├─ env/
│  ├─ .env.example
│  ├─ .env.local.example
│  ├─ .env.staging.example
│  └─ .env.production.example
└─ runbooks/
   ├─ deployment.md
   ├─ rollback.md
   ├─ keycloak-client-secret-rotation.md
   ├─ database-backup-restore.md
   └─ incident-response.md
```

当前 Docker 部署需要保留：

```text
deploy/
├─ docker/
├─ env/
└─ runbooks/
```

不要一开始就引入 Helm、Terraform、ArgoCD 等复杂设施，除非团队已经确定使用这些工具。

### 4.8 `scripts/`

`scripts/` 放可重复执行的工程脚本和运维辅助脚本。

示例：

```text
scripts/
├─ bootstrap-keycloak-realm.ts
├─ seed-portal-db.ts
├─ export-keycloak-config.ts
├─ check-env.ts
├─ rotate-keycloak-secret.ts
└─ reconcile-users.ts
```

原则：

- 脚本必须可重复执行。
- 危险脚本必须支持 dry run。
- 生产脚本必须记录执行人、执行时间、目标环境和结果。
- 不在脚本中硬编码 secret。

### 4.9 `types/`

`types/` 放跨模块共享类型。

建议只放跨模块共享类型：

```text
AuthSession
AdminRole
ApplicationCode
AuditAction
PaginatedResult
ApiErrorCode
```

功能局部类型放在 `features/*/types.ts`。数据库实体类型优先由 ORM 或 schema 工具生成。

## 5. 请求调用链

管理 API 调用链：

```text
app/api/admin/users/[id]/disable/route.ts
  -> lib/auth/require-admin.ts
  -> lib/validation
  -> server/policies/admin-policy.ts
  -> server/services/user-service.ts
  -> lib/keycloak/admin-client.ts
  -> server/repositories/portal-user-repository.ts
  -> lib/audit/write-audit-log.ts
  -> lib/http/api-response.ts
```

页面调用链：

```text
app/(admin)/admin/users/page.tsx
  -> features/users/queries.ts
  -> /api/admin/users
  -> app/api/admin/users/route.ts
  -> server/services/user-service.ts
```

前端组件调用链：

```text
features/users/components/user-table.tsx
  -> features/users/queries.ts
  -> lib/http/client.ts
  -> /api/admin/users
```

这个调用链的目的，是让 UI、HTTP 入站、业务用例、数据访问和第三方系统适配各自保持清晰边界。

## 6. Auth.js 配置位置

建议：

```text
lib/auth/auth-config.ts
lib/auth/auth.ts
lib/auth/require-admin.ts
lib/auth/session.ts
app/api/auth/[...nextauth]/route.ts
```

职责：

- `auth-config.ts`：Provider、callbacks、session 策略。
- `auth.ts`：导出 `auth()`、`signIn()`、`signOut()` 等适配。
- `require-admin.ts`：管理后台服务端鉴权。
- `session.ts`：会话解析和当前用户上下文。
- `route.ts`：只暴露 Auth.js handlers。

Keycloak Provider 配置需要：

```text
KEYCLOAK_ISSUER
KEYCLOAK_CLIENT_ID
KEYCLOAK_CLIENT_SECRET
```

`KEYCLOAK_ISSUER` 必须包含 realm。

## 7. Keycloak Admin Client 位置

建议：

```text
lib/keycloak/admin-client.ts
lib/keycloak/token-client.ts
lib/keycloak/errors.ts
lib/keycloak/mappers.ts
lib/keycloak/types.ts
```

原则：

- 只在服务端使用。
- 不被 Client Component import。
- 封装 token 获取、刷新、错误转换和 DTO 映射。
- 不把 Admin token 返回给前端。
- 对 Keycloak API 错误做统一转换，避免上层依赖 Keycloak 原始错误结构。

## 8. 数据访问层

推荐使用 **Drizzle ORM**。

选型对比：

| 维度 | Prisma | Drizzle | Kysely | 原生 SQL |
|---|---|---|---|---|
| 类型安全 | 优秀 | 优秀 | 良好 | 无 |
| 学习曲线 | 中（需学 Prisma Schema） | 低（SQL-like 语法） | 中 | 低 |
| 性能 | 一般（额外查询引擎） | 优秀（接近原生） | 优秀 | 最优 |
| 迁移工具 | 成熟 | 成熟（drizzle-kit） | 需配合其他工具 | 手动管理 |
| KingbaseES 兼容性 | 可能有问题 | 较好（接近原生 SQL） | 较好 | 最好 |
| 社区生态 | 极活跃 | 活跃 | 一般 | - |
| 与 Next.js 配合 | 好 | 好 | 好 | 好 |

推荐 Drizzle 的理由：

1. **KingbaseES 兼容性**：Drizzle 更接近原生 SQL，在国产数据库兼容性上更有优势。
2. **性能**：没有额外的查询引擎层，性能更可预测。
3. **灵活性**：SQL-like 语法，DBA 容易理解和优化。
4. **类型安全**：与 TypeScript 配合良好，自动生成类型。
5. **迁移工具**：内置 `drizzle-kit`，迁移体验好。

建议结构：

```text
server/repositories/
├─ portal-user-repository.ts
├─ application-repository.ts
├─ assignment-repository.ts
├─ audit-log-repository.ts
└─ organization-repository.ts
```

Repository 只负责数据读写，不做权限判断，不直接访问 Keycloak。

权限判断放在：

```text
server/policies/
```

跨系统编排放在：

```text
server/services/
```

## 9. 权限策略层

```text
server/policies/admin-policy.ts
server/policies/user-policy.ts
server/policies/application-policy.ts
```

示例职责：

- 当前管理员是否能禁用用户。
- 当前管理员是否能重置用户 MFA。
- 当前管理员是否能授予应用访问权。
- 当前管理员是否能查看审计日志。

不要把权限判断散落在 UI 或 repository 中。UI 可以根据权限隐藏按钮，但服务端必须再次判断。

## 10. API 响应与错误处理

统一放在：

```text
lib/http/api-response.ts
lib/http/errors.ts
lib/http/request-id.ts
```

建议：

```text
ok(data)
created(data)
accepted(data)
fail(errorCode, message, status)
```

所有 API 返回 `requestId`。

错误分类建议：

```text
AUTH_REQUIRED
FORBIDDEN
VALIDATION_ERROR
KEYCLOAK_UNAVAILABLE
KEYCLOAK_OPERATION_FAILED
DATABASE_ERROR
CONFLICT
RATE_LIMITED
INTERNAL_ERROR
```

## 11. 校验层

建议：

```text
features/users/schemas.ts
features/applications/schemas.ts
features/organizations/schemas.ts
lib/validation/common.ts
```

前后端可以共享 schema，但服务端必须再次校验。

原则：

- 表单校验可以给用户更好的交互反馈。
- Route Handler 的服务端校验是安全边界。
- 不信任来自浏览器的任何字段，包括隐藏字段。

## 12. 审计日志

审计入口：

```text
lib/audit/write-audit-log.ts
server/repositories/audit-log-repository.ts
```

所有管理写操作必须记录：

```text
actor
action
target
before_data
after_data
result
request_id
trace_id
operation_id
ip
user_agent
```

建议在 service 层编排审计，而不是在 repository 层自动写审计。原因是 service 层最清楚本次操作的业务意图、操作者和目标对象。

## 13. 同步任务

建议：

```text
server/jobs/
├─ dispatch-outbox-events.ts
├─ project-keycloak-assignments.ts
├─ deliver-webhooks.ts
├─ reconcile-keycloak-users.ts
├─ reconcile-application-projections.ts
├─ sync-application-assignments.ts
└─ retry-dead-letter-events.ts
```

### 13.1 任务队列实现

部署目标为 Node.js Runtime，使用 **BullMQ + Redis** 实现内部任务队列和定时任务调度：

- 事件表派发、Keycloak 投影、Webhook 投递、对账和死信重试均通过 BullMQ 队列执行。
- 定时任务使用 BullMQ 的 repeatable jobs。
- BullMQ 负责任务调度、重试、并发控制和优先级管理。
- RabbitMQ Quorum Queue 负责平台内部事件分发（与 BullMQ 职责不同，不互相替代）。
- 即使后续拆分独立 worker，任务逻辑代码不需要改动，只需调整入口和部署配置。

同步任务逻辑写成纯函数，放在 `server/jobs/`，不耦合 Next.js runtime。

### 13.2 部署形态

目标部署形态为 Node.js Runtime。如果未来部署环境不适合长期运行后台任务，可以独立拆出 worker：

```text
apps/portal
apps/worker
packages/shared
```

同步任务不要依赖页面组件，也不要复用 Client Component 的查询逻辑。它应该复用 `server/services`、`server/repositories`、`lib/keycloak`、`lib/mq` 和 `lib/audit`。

## 14. 单仓库还是多仓库

默认工程形态是单仓库单应用：

```text
identity-portal
```

当出现以下情况再拆 monorepo：

- 需要独立 worker。
- 权限中心独立服务。
- 多个前端共享组件。
- 多个服务共享 SDK。
- Keycloak client、审计 client、权限 client 需要被多个服务复用。

拆分后建议：

```text
identity-platform/
├─ apps/
│  ├─ portal/
│  └─ worker/
├─ packages/
│  ├─ ui/
│  ├─ auth/
│  ├─ keycloak-client/
│  ├─ db/
│  └─ schemas/
├─ deploy/
└─ docs/
```

不要为了“看起来平台化”而过早 monorepo。先把边界设计好，等复用、单独交付或扩缩容需求真实出现后再拆。

## 15. 环境变量分层

推荐样例文件放在：

```text
deploy/env/
├─ .env.example
├─ .env.local.example
├─ .env.staging.example
└─ .env.production.example
```

本地实际文件：

```text
.env.local
```

代码中通过 `lib/config/env.ts` 统一读取和校验。

不要在业务代码中直接到处读取 `process.env`。

环境变量分类：

```text
应用运行配置
Keycloak OIDC 配置
Keycloak Admin API 配置
统一身份平台数据库配置
审计日志配置
RabbitMQ / MQ adapter 配置
外部业务应用配置
日志和监控配置
```

严禁把生产 secret 提交到仓库。`deploy/env/*.example` 只放变量名和示例占位值。

## 16. 测试结构

```text
tests/unit        纯函数、policy、schema
tests/integration Route Handler、repository、Keycloak client mock
tests/e2e         登录、用户管理、应用授权关键路径
```

优先覆盖：

- 管理 API 权限。
- 用户禁用流程。
- 用户启用流程。
- 重置密码流程。
- 重置 MFA 流程。
- 应用准入授权。
- 审计日志写入。
- 事件表写入和派发。
- RabbitMQ/MQ adapter 投递失败处理。
- Keycloak 调用失败处理。
- 统一身份平台数据库与 Keycloak 状态不一致时的对账。

## 17. 部署与运维最佳实践

项目结构需要从一开始考虑部署和运维，但不要过度工程化。

项目结构应包含：

- `deploy/docker/Dockerfile`：统一构建镜像。
- `deploy/env/*.example`：环境变量样例。
- `deploy/runbooks/deployment.md`：发布步骤。
- `deploy/runbooks/rollback.md`：回滚步骤。
- `deploy/runbooks/keycloak-client-secret-rotation.md`：Keycloak client secret 轮换。
- `scripts/check-env.ts`：启动前检查关键环境变量。
- `app/api/health/route.ts`：健康检查接口。
- `server/jobs/`：outbox 派发、投影、webhook、对账和死信重试任务。
- `lib/mq/`：RabbitMQ 优先实现和国产化 MQ 替换边界。

运维相关内容不建议放在 `docs/` 里混杂管理。`docs/` 写设计和说明，`deploy/runbooks/` 写可执行的上线、回滚、故障处理步骤。

## 18. 推荐依赖边界

允许：

```text
app -> features
app -> components
app/api -> server/services
app/api -> lib/auth
server/services -> server/repositories
server/services -> server/policies
server/services -> lib/keycloak
server/services -> lib/audit
server/repositories -> lib/db
features -> components
features -> lib/http
features -> types
```

禁止：

```text
components -> server
components -> lib/keycloak/admin-client
features -> server/repositories
features -> lib/keycloak/admin-client
repository -> React component
repository -> Keycloak Admin API
client component -> server secret
client component -> process.env 非 NEXT_PUBLIC 变量
```

建议使用 lint 规则或架构测试限制这些依赖方向，避免项目变大后边界失效。

## 19. 当前项目的最终建议

当前设计建议使用：

```text
Next.js 单应用
App Router
features 按前端业务能力组织
server/services 承载服务端用例
server/policies 承载服务端权限判断
server/repositories 封装统一身份平台数据库访问
lib/keycloak 封装 Keycloak Admin API
lib/auth 封装 Auth.js
lib/audit 封装审计写入
lib/mq 封装 RabbitMQ 和国产化 MQ 替换边界
deploy 管理部署和运维资产
scripts 管理可重复执行的初始化和运维脚本
```

这套结构适合当前方案的原因：

- 统一身份门户和管理后台本身是一个清晰的 Next.js 应用。
- 用户、组织、应用、角色、审计天然适合用 `features/` 拆前端业务模块。
- Keycloak、统一身份平台数据库、审计、同步任务需要明确放在服务端边界内。
- Supabase 只是接入应用之一，不应该让 Supabase 的内部结构反向主导统一门户项目。
- 部署、密钥轮换、备份恢复、健康检查是身份系统的基础能力，应该在项目结构中有明确位置。

不要急于拆 monorepo，也不要让业务应用内部结构污染统一门户项目。先把单应用内部边界做好，再按真实部署和复用需求拆分。

---
docType: impl-plan
scope: repo
status: active
authoritative: true
owner: identity-center
language: zh
whenToUse: 需要确认实施顺序、里程碑、范围裁剪或验收标准时阅读本文档。
whenToUpdate: 实施顺序、里程碑、范围裁剪或验收标准发生变化时更新本文档。
checkPaths:
  - docs/implementation/README.md
  - GOAL.md
  - docs/design/README.md
lastReviewedAt: 2026-07-06
lastReviewedCommit: 16f3661
---

# 统一身份平台实施方案

> 制定日期：2026-07-02（v2，按一期全量交付修订）
> 依据：[设计文档集](../design/README.md)（12 篇正式设计文档，已通过 2026-06-29 v2 评审，无遗留开放问题）
> 定位：设计文档集描述目标态架构，本方案定义**实施顺序、验收标准和实施工作方式**。本方案不分期：一期完成全部目标态范围。
> 执行入口：交付目标与完成定义见仓库根 [GOAL.md](../../GOAL.md)。

## 1. 背景与实施依据

设计侧已具备的资产：

| 资产 | 状态 |
|---|---|
| 12 篇正式设计文档（架构 5 + 应用 4 + 治理 3） | 已通过两轮评审，v2 结论"可以进入实施阶段" |
| 22 项确认设计决议 | 已全部融入正式文档 |
| 15 个高保真 HTML 原型页面（`identity-platform-admin/pages/`） | 页面实现依据 |
| 设计库（`.design_library/identity-platform/`：tokens、主题、38 个组件规范、图标） | 视觉规范与主题 token 来源 |
| 技术栈 | 全部锁定，见 [总体架构设计 §11](../design/01-architecture/01-overall-architecture/README.md) |

设计文档明确留给实施阶段的五类产物，本方案已排入对应阶段：

| 产物 | 产出阶段 |
|---|---|
| 数据库 DDL | L1（Drizzle schema + migrations，双库验证） |
| OpenAPI / 接口契约 | L4 |
| Keycloak 实际配置导出 | L0 建立，随实施持续更新 |
| 测试用例 | 每层随层交付 |
| 上线 runbook | L7 |

## 2. 已确认的实施决策

| 决策项 | 结论 |
|---|---|
| 交付模式 | **一期全量交付，不分期**：设计目标态全部能力一次完成（non-MVP），无"二期候选"清单 |
| 首个接入业务应用 | Supabase 业务应用（含存量用户映射） |
| 开发模式 | **Claude Code 全自主开发**：开发、测试、文档、交付全部由 AI 执行；人不参与编码与评审，仅通过 issue 提出需求、缺陷与阻塞裁决（见 §4.3） |
| 部署目标 | 单机 Docker Compose（开发与首期生产同构） |
| 实施路径 | **分层横切**：按依赖层次自底向上构建，每层配备不依赖上层的可执行验收 |
| 数据库兼容 | PostgreSQL 一等公民实测；**KES 非阻塞**（D-001 用户裁决，见 decisions.md）：兼容约定 + `lib/db` thin adapter + `KES_ENABLED=1` 参数化矩阵三件套交付，实测环境可得后补验 |
| 前端体验（设计增补） | **多语言（zh-CN 默认 + en）与深浅色模式（light/dark/system）**为一期必交能力；此为设计文档未覆盖的新增需求，以本方案为准 |
| 实施工作方式 | **实现前先查证**：优先使用 Context7 查询相关库当前文档，或用网络搜索参考同类最佳实践，禁止凭记忆使用可能过时的 API（详见 §4.2） |

## 3. 一期范围定义

### 3.1 范围 = 设计目标态全量

覆盖 [总体架构设计 §2](../design/01-architecture/01-overall-architecture/README.md) 定义的核心业务流程及设计文档全部能力：

```text
用户提交注册 -> 平台记录申请 -> 管理员审批 -> 开通账号
  -> 分配应用准入 -> 分配应用角色 -> 同步 Keycloak 与业务应用
  -> 用户登录并进入业务应用（Supabase）
```

按能力分解：

- 认证：OIDC 登录/登出/会话（Auth.js + Keycloak）、注册（默认模式 A：Keycloak 托管）、MFA（Keycloak 承载）、Keycloak 登录/注册页主题定制（对齐原型，多语言）。
- 管理后台：用户管理（含禁用/启用/重置密码/重置 MFA）、注册审批与注册配置、应用目录、应用准入、应用角色分配、组织目录与成员、组织↔业务应用映射、Platform Admin RBAC、审计日志查询、系统设置。
- 用户门户与账号中心：门户首页、我的应用、资料/安全/会话。
- 前端体验：多语言（zh-CN/en，全部文案资源化）、深浅色模式（映射设计库主题 token）、统一 design system。
- 同步管道：Outbox → RabbitMQ（adapter 隔离）→ Worker/Webhook → 对账兜底；撤权/禁用同步强一致，授权/资料最终一致；7 个后台任务全部实现。
- 业务应用接入：Supabase 应用完成 SSO、准入校验、撤权生效、本地用户映射与**存量用户盘点绑定**（按迁移指南）。
- 安全与运维：安全评审清单 17 项全部闭环（含 PII 字段级加密 AES-256-GCM、CSP）、备份恢复演练、监控告警、生产 Compose、5 份 runbook、break_glass 预案。
- 数据库兼容：迁移与核心数据访问在 PostgreSQL 实测通过；KES 侧交付兼容约定 + thin adapter + 参数化矩阵（D-001，实测后补）。

### 3.2 范围完整性说明（消除歧义，非裁剪）

以下事项按设计文档本身的定义处理，不构成分期：

| 事项 | 一期处理方式 | 依据 |
|---|---|---|
| 租户模型（`platform_tenants`、`platform_tenant_members`） | 表、repository、service 支持全部实现；是否启用为**部署配置项**（设计未定义租户 API 与页面，不额外发明） | 设计标注"仅多租户隔离需求时启用" |
| 国产 MQ | `lib/mq` adapter 契约 + 契约测试完整交付，RabbitMQ 为一期唯一实现；具体国产 MQ connector 属设计预留的替换空间 | [总体架构设计 §3.3](../design/01-architecture/01-overall-architecture/README.md)"通过适配层隔离具体产品" |
| Worker 独立部署 / Monorepo 拆分 | 单体交付（平台权限中心为 Portal 内服务端模块），代码边界按设计保持可拆分 | 设计决议：真实触发条件出现后再拆 |
| 非 Supabase 旧系统迁移 | 迁移指南与工具化脚本能力随 L6 沉淀为通用接入文档；具体系统的迁移执行随其接入进行 | [迁移与接入指南](../design/03-governance/03-migration-onboarding-guide/README.md) |

### 3.3 数据库表清单（20 张全部建立）

```text
用户与注册：portal_users、registration_requests
应用与授权：applications、application_roles、application_assignments、application_user_roles
组织与租户：platform_organizations、platform_organization_members、
            business_app_organization_mappings、platform_tenants、platform_tenant_members
管理权限：admin_roles、admin_permissions、admin_role_permissions、admin_user_roles
审计：audit_logs（append-only + hash chain）
事件：outbox_events、webhook_deliveries、dead_letter_events、processed_events
```

## 4. 总体实施路径与工作方式

### 4.1 分层路径

分层横切，L0 → L7 严格按依赖顺序推进。分层路径的固有风险是"集成风险后置"，对冲原则：

1. **每层出口验收必须可执行**：验收以"测试对真实容器"（docker compose 起真实 Keycloak/PostgreSQL/KingbaseES/RabbitMQ/Redis 后跑集成测试）为准，不以"代码写完"为准。
2. **登录冒烟前置**：L2 完成时 OIDC 登录链路天然可运行，作为第一个端到端信号。
3. **每层完成即提交**：git 按层留下可回退的稳定点，进度表（§9）同步更新。

```text
L0 基础设施 -> L1 数据层 -> L2 基础能力层 -> L3 服务与任务层
  -> L4 接口层 -> L5 页面层 -> L6 全链路联调与 Supabase 接入 -> L7 安全加固与上线
```

### 4.2 实施工作方式：文档查证优先

每次引入或升级库、实现关键集成、遇到不确定的 API 用法时，按以下顺序查证后再动手：

1. **Context7 查询该库当前版本文档**（重点对象：Next.js App Router、Auth.js、Drizzle ORM、BullMQ、amqplib、next-intl、next-themes、shadcn/ui、TanStack Query、React Hook Form、Zod、Playwright、Keycloak Admin REST API / keycloak-admin-client）。
2. Context7 覆盖不足时，**网络搜索**官方文档与同类项目成熟实践（如 Auth.js + Keycloak 刷新 token 轮换、Drizzle 多数据库适配、Keycloak 主题定制）。
3. 关键结论（选定版本、选用 API、已知坑）沉淀到 `docs/references/`，避免重复查证。
4. **禁止凭记忆编写可能过时的 API 调用**；库大版本选择在 L0 一次确定并记录。

### 4.3 协作模式：issue 驱动

人不参与开发，全部开发决策与执行由 AI 完成；人的唯一介入通道是 issue：

- **渠道**：仓库配置 GitHub remote 时使用 GitHub Issues（`gh` CLI 读写）；否则使用仓库内 `docs/issues/NNN-<slug>.md`（状态：open / in-progress / resolved）。
- **AI 处理规则**：开工时与每层完成时检查 issue；按类型处理——缺陷（复现 → 修复 → 测试 → 回执证据）、需求（评估对范围/不变量的影响，记录到 `docs/implementation/decisions.md` 后排入计划）、裁决请求（AI 提出的阻塞项，人答复后继续）。
- **AI 上行通道**：需要人裁决的事项（如 KingbaseES 环境获取、设计矛盾）由 AI 主动创建阻塞 issue，同时继续其他不受影响的工作。

## 5. 各阶段详细计划

### L0 基础设施（概量 4-6 天）

目标：一键可复现的开发环境与可构建的项目骨架。

工作项：

- `deploy/docker/docker-compose.dev.yml`：PostgreSQL（平台库与 Keycloak 库独立 database/账号，逻辑隔离）、**KingbaseES**（PostgreSQL 兼容模式，供双库验证；如镜像获取受限，建立获取方案并作为阻塞项跟踪）、Keycloak（外置 DB、健康检查、反代头）、Redis、RabbitMQ（Quorum Queue）、Mailpit（开发 SMTP）。
- `scripts/bootstrap-keycloak-realm.ts`：从零创建 `company-dev` realm、`user-portal` Client（confidential、Standard Flow）、`user-portal-admin-api` Client（Service Account）、三个全局角色（`admin_console_access`、`platform_admin`、`break_glass_admin`）、密码/MFA 策略、SMTP 指向 Mailpit、**realm 多语言启用（zh-CN/en）**；执行后导出 realm JSON 存入仓库。
- Next.js 项目骨架：按 [项目结构设计](../design/02-application/04-project-structure-design/README.md) 建立目录与依赖边界（ESLint 规则约束禁止依赖方向）；**next-intl 与 next-themes 基础接线**（locale 资源结构、theme provider、设计库 token 映射入口）。
- 依赖版本锁定：按 §4.2 查证各库当前稳定版本，记录于 `docs/references/`。
- `scripts/check-env.ts` 与分环境 env 样例；CI：lint + typecheck + test。

交付物：compose 文件（含 KES）、bootstrap 脚本、realm 导出 JSON、含 i18n/theme 底座的项目骨架、依赖版本记录、CI。

验收标准：

- `docker compose up` 一次成功拉起全部基础服务且健康检查通过（含 KingbaseES）。
- Keycloak 配置可完全脚本重建（删 realm 重跑 bootstrap 结果一致），登录页可切换 zh-CN/en。
- 骨架页面可切换语言与深浅色（占位内容即可）；CI 全绿。

### L1 数据层（概量 7-10 天）

目标：全部表结构、迁移与数据访问基础，**双库实测**。

工作项：

- `db/schema/` 按模块拆分定义 §3.3 全部 20 张表（Drizzle ORM）；核心约束：`portal_users.keycloak_sub` 唯一、`processed_events (event_id, consumer)` 唯一、`application_assignments` 投影状态字段（`projection_status`、`business_projection_status` 及错误/时间戳字段）。
- drizzle-kit migrations；`scripts/seed-portal-db.ts`：内置 5 个管理角色（`platform_admin`、`user_admin`、`app_admin`、`auditor`、`support`）、完整 permission code 清单（`user:disable`、`app:assign`、`audit:view` 等）、初始管理员引导（Keycloak 种子管理员 → `portal_users` + `admin_user_roles`）。
- `server/repositories/` 基础读写与分页查询。
- **双库兼容工程化**：KingbaseES 兼容约定成文（禁用 PG 专有特性清单、类型映射注意项）；测试矩阵将迁移与 repository 集成测试同时跑在 PostgreSQL 与 KingbaseES 上（本地脚本 + CI 任务）。

交付物：完整 DDL（迁移文件）、seed 脚本、repository 层、兼容性约定文档、双库测试矩阵。

验收标准：

- 迁移从零到最新可重复执行且可回滚，**在 PostgreSQL 与 KingbaseES 上均通过**；seed 幂等。
- repository 集成测试**双库全绿**。
- 兼容性约定文档纳入 code review 检查项。

### L2 基础能力层 lib/（概量 6-10 天）

目标：认证、Keycloak 集成与全部横切能力。

工作项：

- `lib/auth/`：Auth.js Keycloak Provider（Authorization Code Flow）、session（HttpOnly/Secure/SameSite=Lax）、`require-admin.ts`（token 校验：iss/aud/exp/签名/sub + `admin_console_access` 入口角色）。
- `lib/keycloak/`：`admin-client.ts`（Service Account token 获取与缓存）、`token-client.ts`、`errors.ts`（Keycloak 错误 → 统一错误码转换）、`mappers.ts`（`keycloak_sub` 与 `keycloak_user_id` 语义区分）。
- `lib/http/`：统一响应结构（`data`/`error`/`requestId`）、13 个错误码常量（`UNAUTHENTICATED`、`FORBIDDEN`、`APP_ACCESS_DENIED`、`USER_NOT_FOUND`、`APPLICATION_NOT_FOUND`、`VALIDATION_ERROR`、`CONFLICT`、`KEYCLOAK_ERROR`、`DEPENDENCY_FAILED`、`SYNC_PENDING`、`RATE_LIMITED` 等）、`csrf-check.ts`（SameSite + Origin 校验 + JSON-only）。
- `lib/permissions/`：`can()` / `canWithReason()`，继承规则 global → org → app，`platform_admin` 全权限。
- `lib/audit/`：审计写入（requestId/traceId/operationId、before/after、record_hash 链）。
- `lib/mq/`：adapter 最小接口（publish/consume/ack/nack/healthCheck/close）+ 契约测试，RabbitMQ 实现。
- `lib/crypto/`：**PII 字段级加密（AES-256-GCM）**帮助库与密钥装载（供敏感字段列加密使用）。
- `lib/rate-limit/`（Redis 滑动窗口）、`lib/config/`、`lib/validation/`、`lib/i18n/`（服务端消息与错误文案资源化辅助）。

交付物：lib 全模块 + 单元测试 + Keycloak 集成测试。

验收标准：

- **登录冒烟**：本地起 Portal，管理员经 Keycloak 完成 OIDC 登录/登出，受保护路由生效。
- admin-client 对真实 Keycloak 的集成测试全绿（建用户、赋角色、禁用、登出会话）。
- CSRF、rate-limit、audit、mq adapter、crypto 单测覆盖关键分支。

### L3 服务与任务层 server/（概量 11-16 天）

目标：全部业务用例与 7 个后台任务，核心链路被集成测试证明。

工作项：

- `server/services/`：user-service（创建/禁用/启用/重置密码/重置 MFA；**Keycloak disable 成功才算禁用完成**）、application-service、assignment-service（授予最终一致、**撤销以 Keycloak Client Role 移除成功为关键完成点**，覆盖 200/202/409/502/424 五种结果语义）、app-role-service、registration-service（pending/approved/rejected/cancelled 状态机；审批通过 → 创建/启用 Keycloak 用户 → 写 `portal_users`）、organization-service（含**组织↔业务应用映射维护与投影**）、tenant-service（配置驱动启用）、admin-rbac-service、audit-service。
- `server/policies/`：Route Handler 入口 / Service / UI 三层校验中的前两层。
- 事务边界：所有平台事实变更在**同一数据库事务**内写事实表 + `outbox_events`。
- `server/jobs/`（BullMQ）：`dispatch-outbox-events`、`project-keycloak-assignments`、`deliver-webhooks`（HMAC-SHA256 签名 `sha256=base64(HMAC(secret, timestamp + '.' + rawBody))`、时间戳 5 分钟窗口、指数退避重试 1s/5s/30s/2min/10min 共 5 次）、`reconcile-keycloak-users`、`reconcile-application-projections`、`sync-application-assignments`、`retry-dead-letter-events`。
- 幂等：消费者按 `event_id + consumer` 去重（`processed_events`）；12 类事件 payload 含 `eventVersion`。
- 对账频率：高风险（用户禁用、准入撤销）每小时，普通资料每日，全量每周。

交付物：services + policies + jobs + 集成测试套件。

验收标准（全部以对真实容器的集成测试证明）：

- 创建 → 禁用用户：Keycloak 状态正确、会话登出、事件发布、审计落库。
- 授予 → 撤销准入：Client Role 出现/移除、`projection_status` 流转正确、撤销失败路径进入重试与告警状态。
- 事件端到端：事实变更 → outbox → RabbitMQ → 消费者投递成功且重复投递被幂等拦截。
- 故障演练：停 RabbitMQ 产生积压后恢复，投递补齐；人为制造 Keycloak 投影差异，对账任务修复。
- 核心 service 集成测试**双库全绿**（至少覆盖用户、准入、审计三条链路）。

### L4 接口层 app/api/（概量 8-12 天）

目标：约 57 个端点全部可用，契约成文。

工作项：

- 四组前缀：`/api/admin/*`（用户 8 + 注册审批 4 + 组织 9 + 应用 4 + 准入 3 + 应用角色 6 + 管理角色权限 5 + 审计 1）、`/api/public/*`（注册申请提交等）、`/api/account/*`（profile、apps、sessions）、`/api/internal/*`（同步/健康）；另有 `/api/health`、`/api/auth/[...nextauth]`。
- 统一接线：CSRF 中间件、三层权限校验前两层、审计写入、`Idempotency-Key` 支持（创建用户、分配应用、禁用用户等写操作）、列表统一分页参数（`page/pageSize/keyword/sort/order/filters`）。
- 速率限制：登录 5 次/分钟（IP+账号）、注册 10 次/小时（IP）、找回密码 3 次/小时、管理 API 100 次/分钟（用户）、Webhook 60 次/分钟（应用）；不暴露剩余次数。
- 错误文案多语言：错误码 → 文案经 i18n 资源解析。
- OpenAPI 3.0 文档生成与发布。

交付物：全部 Route Handler、OpenAPI 契约、API 集成测试。

验收标准：

- 每个端点具备契约测试；未登录（401）/越权（403）/参数错误（400）/冲突（409）路径全覆盖。
- 审计断言：每个管理写操作产生一条审计记录。
- 撤权接口按状态机返回 200/202/409/502/424。

### L5 页面层 app/ + features/（概量 15-21 天）

目标：约 24 个页面，对照原型与设计库实现，多语言与主题全覆盖。

工作项：

- 组件底座：shadcn/ui + Tailwind 按设计库 tokens（`ui-base-tokens.css`/`ui-base-themes.css`/`colors_and_type.css`）定制**明暗双主题**；data-table（TanStack Query 分页/筛选/批量操作）、表单（React Hook Form + Zod，与 `features/*/schemas.ts` 共享）、危险操作确认（二次确认 + 近期认证）。
- **多语言落地**：next-intl 全站接线，zh-CN（默认）与 en 两套 messages；全部 UI 文案、校验消息、日期/数字格式资源化，语言切换器持久化；禁止硬编码文案（ESLint 约束）。
- **深浅色模式落地**：next-themes 三态（light/dark/system），切换持久化；全部页面在两种主题下走查。
- 管理后台 12 页：概览、用户列表/新建/详情（7 个 Tab + 危险操作区）、注册审批、注册配置、组织、应用列表/详情、角色权限、审计日志、系统设置。
- 账号中心 4 页：资料、安全、会话、已授权应用。
- 公共与门户：登录、注册、错误/403、用户门户首页、我的应用。
- **Keycloak 登录/注册页主题定制**：对齐 `login.html`/`register.html` 原型的品牌与布局（Keycloak custom theme，zh-CN/en）。
- 注册入口默认**模式 A（Keycloak 托管注册）**；走查原型后如确认需要自定义表单体验，切换模式 B（Next.js 表单 + 服务端校验），预估增量 2-3 天。

交付物：全部页面 + Keycloak 主题 + i18n 资源 + Playwright e2e。

验收标准：

- 逐页对照 15 个原型走查（布局、状态、危险操作交互一致），**明暗两主题、双语言下均通过**。
- e2e 覆盖四条关键流程：登录、用户禁用、准入授予/撤销、注册审批；另加语言切换与主题切换冒烟用例。
- 前端仅做体验层权限隐藏，权限判定全部来自服务端。

### L6 全链路联调 + Supabase 接入（概量 5-8 天）

目标：真实业务应用经由平台完成完整开通链路。

工作项：

- 端到端演练：注册 → 审批 → 开通 → 准入 → 角色 → 同步 → 登录 Supabase 应用。
- Supabase 应用接入（按 [迁移与接入指南](../design/03-governance/03-migration-onboarding-guide/README.md) 十步流程）：创建 `supabase-business-app` Client 与 `supabase_app_access` Client Role；应用侧校验 `resource_access[client_id].roles`（401 `UNAUTHENTICATED` / 403 `APP_ACCESS_DENIED`）；建立 `keycloak_sub → 本地用户` 映射；接入 Webhook 消费（签名验证 + 幂等）；连通性测试工具。
- **存量用户迁移**：按迁移指南盘点 Supabase 现有用户，优先级匹配（外部 ID > 已验证邮箱 > 手机号 > username > 人工处理），建立映射；如保留 Supabase 自有登录，按 `dual_login → keycloak_default` 状态机推进并明确回滚条件。
- 平台侧 `applications` 登记、准入投影验证、撤权生效验证、组织映射（`business_app_organization_mappings`）配置。
- 将接入过程沉淀为可复用接入文档（后续应用直接套用）。

交付物：Supabase 接入完成、存量用户映射记录、通用接入文档、接入验收清单。

验收标准：

- 接入验收清单 10/10（Client 配置、token 校验、映射唯一、回滚方案、禁用同步、审计可查、权限边界、准入投影、撤权投影、测试报告）。
- 撤权后：token 刷新不再含 Client Role，业务侧拒绝访问，平台侧对账无差异。
- 存量用户抽样登录验证通过，无错绑。

### L7 安全加固与上线（概量 6-9 天）

目标：满足安全设计全部要求，生产环境就绪。

工作项：

- [安全设计](../design/03-governance/01-security-design/README.md) §16 评审清单 17 项逐项闭环（Secret 管理、Token/Cookie、CSRF、XSS/CSP、CORS、SSRF、防枚举、速率限制、越权防护、高风险操作、审计、网络边界、Keycloak 可用性与降级）。
- **PII 字段级加密落地**：敏感字段（手机号等）经 `lib/crypto` 列加密存储，密钥从环境/密钥管理注入。
- Keycloak 降级策略落地验证："已持有 token 继续用、新登录 503、准入缓存仅拒绝不放行、恢复后全量对账"。
- 验证码（Turnstile/hCaptcha）接入登录/注册（可配置开关）。
- 生产 `docker-compose.prod.yml`：HTTPS/反代、secrets 注入、资源限制、日志采集。
- 备份与恢复：Keycloak DB 每日 + realm 每周导出、平台 DB 每日（保留 30 天 + 月度）、恢复演练一次成功（RTO 30 分钟 / RPO 当天事件不丢）。
- 监控告警：事件积压（>1000 告警）、死信增长、Webhook 失败率（>1%）、投影失败、登录失败率、证书过期。
- 5 份 runbook：deployment、rollback、keycloak-client-secret-rotation、database-backup-restore、incident-response；break_glass 应急预案。
- **双库终验**：完整测试套件在 KingbaseES 上复跑一轮并留档。

交付物：生产部署、runbooks、监控告警、安全清单记录、双库验证报告。

验收标准（即一期上线门槛）：

- 安全清单 17/17 通过并留档。
- 恢复演练成功；高风险对账连续运行无差异。
- 端到端链路在生产环境复验通过；双库验证报告完成。

## 6. 测试策略

| 层级 | 范围 | 工具 | 引入阶段 |
|---|---|---|---|
| 单元测试 | lib、services 纯逻辑、权限继承、签名/幂等/加密算法 | Vitest | L1 起 |
| 集成测试 | repository、Keycloak Admin API、事件管道、对账 | Vitest + 真实容器（compose） | L1 起，L3 为主战场 |
| **双库矩阵** | 迁移、repository、核心 service 链路 | 同一集成套件跑 PostgreSQL 与 KingbaseES | L1 起持续，L7 终验 |
| 契约测试 | 全部 API 端点、错误码、撤权状态机 | Vitest（HTTP 层） | L4 |
| E2E | 登录、禁用、准入授予/撤销、注册审批 + 语言/主题切换冒烟 | Playwright | L5 |

测试重点按设计风险排序：撤权链路（5 态）、禁用完成点语义、幂等（API/MQ/Webhook 三层）、对账修复、权限越权路径、双库行为一致性。

## 7. 风险与对策

| 风险 | 等级 | 对策 |
|---|---|---|
| 分层路径集成风险后置 | 高 | 每层验收对真实容器执行；L2 登录冒烟、L3 链路集成测试提前暴露集成问题 |
| KingbaseES 开发环境可得性（镜像/授权） | 高 | L0 即解决获取方案；获取受限时立即上报为阻塞项，**不得静默降级为"仅 PG 验证"** |
| 撤权/禁用多系统一致性 | 高 | 严格按决议实现完成点语义；L3 故障演练列为验收项 |
| Keycloak Admin API 不可用 | 高 | 统一错误转换 + 降级策略（L7 验证）+ break_glass 预案 |
| 事件丢失 / 重复消费 | 高 | Outbox 事务写入 + 幂等表 + 对账兜底，三层机制在 L3 一次建成 |
| 双库行为差异（类型/函数/事务语义） | 中 | 兼容约定 + 双库矩阵持续运行，差异在引入当层即暴露而非上线前 |
| AI 会话中断 / 上下文丢失 | 中 | 每层出口 git 稳定点 + 进度表（§9），任意中断可从层边界恢复（恢复规则见 GOAL.md §9） |
| 阻塞裁决等待人响应 | 中 | 阻塞以 issue 异步提出，期间继续不受影响的工作，不空转等待 |
| i18n/主题引入的页面工作量放大 | 中 | 底座在 L0 建立、文案资源化随页面同步做，避免"先硬编码后翻译"的返工 |
| 库版本知识过时导致返工 | 中 | §4.2 工作方式强制先查证（Context7/网络搜索）再实现 |
| 注册模式 A/B 摇摆 | 低 | 默认模式 A，L5 走查原型后一次性决策，增量已预估 |

## 8. 交付物汇总

| 交付物 | 阶段 | 位置 |
|---|---|---|
| GOAL.md（执行目标与完成定义） | 本方案随附 | 仓库根 |
| Docker Compose（dev/prod，含 KingbaseES） | L0 / L7 | `deploy/docker/` |
| Keycloak bootstrap 脚本 + realm 导出 + 登录主题 | L0 / L5 | `scripts/`、`deploy/keycloak/` |
| 数据库 DDL(migrations) + seed + 双库兼容约定 | L1 | `db/migrations/`、`scripts/`、`docs/references/` |
| 依赖版本与查证记录 | L0 起持续 | `docs/references/` |
| OpenAPI 契约 | L4 | `docs/references/`（生成发布） |
| i18n 资源（zh-CN/en）+ 主题 token 映射 | L0/L5 | 项目内 |
| 测试套件（unit/integration/双库矩阵/contract/e2e） | 每层 | `tests/` |
| Supabase 接入文档（通用化）+ 存量映射记录 | L6 | `docs/guides/` |
| Runbooks（5 份） | L7 | `deploy/runbooks/` |
| 监控告警配置 + 双库验证报告 | L7 | `deploy/`、`docs/references/` |

## 9. 里程碑进度表

| 阶段 | 概量 | 状态 | 完成日期 |
|---|---|---|---|
| L0 基础设施 | 4-6 天 | **已完成**（KES 实测除外，D-001 非阻塞） | 2026-07-02 |
| L1 数据层（双库） | 7-10 天 | **已完成**（KES 补验待环境，D-001） | 2026-07-02 |
| L2 基础能力层 | 6-10 天 | **已完成**（登录冒烟实测通过） | 2026-07-02 |
| L3 服务与任务层 | 11-16 天 | **已完成**（故障演练 4 项全过） | 2026-07-02 |
| L4 接口层 | 8-12 天 | **已完成**（契约测试 12 项） | 2026-07-02 |
| L5 页面层（i18n + 主题） | 15-21 天 | **已完成**（24 页 + 双语双主题 + e2e 9 项） | 2026-07-02 |
| L6 联调与 Supabase 接入 | 5-8 天 | **已完成**（端到端链路 + 接入 kit + 迁移工具 + 接入文档） | 2026-07-02 |
| L7 安全加固与上线 | 6-9 天 | **已完成**（安全清单 17/17、恢复演练、5 runbook） | 2026-07-02 |

概量按"人日折算口径"估计（合计约 62-92），仅用于表达各层相对工作量与进度权重；开发由 AI 全自主执行，实际日历工期取决于执行节奏与阻塞 issue 的人工响应时延。状态随实施更新，每层完成时在本表记录日期与对应 commit。

**L0-L7 全部完成（2026-07-02）。** 完成定义逐条核对见 [definition-of-done.md](./definition-of-done.md);唯一非阻塞遗留为 KES 双库实测(D-001,本机无可用镜像,三件套已就绪待环境)。

## 10. 设计预留的演进边界（非本方案范围裁剪）

以下为设计文档自身定义的"触发条件出现后再做"事项，一期交付其边界与接口，不执行拆分/替换动作：

- 国产 MQ 替换：adapter 契约已交付，替换时实现对应 connector 并通过契约测试。
- Worker 拆分独立部署：触发条件为后台任务负载影响 Portal 资源或需独立扩缩容。
- Monorepo 拆分：触发条件为多前端共享组件或权限中心独立服务需求出现。
- 其他旧系统迁移：按 [迁移与接入指南](../design/03-governance/03-migration-onboarding-guide/README.md) 的 `dual_login → keycloak_default → legacy_disabled → legacy_removed` 状态机执行。

## 11. 参考

- [GOAL.md（执行入口）](../../GOAL.md)
- [设计文档集](../design/README.md)
- [总体架构设计](../design/01-architecture/01-overall-architecture/README.md)
- [项目结构设计](../design/02-application/04-project-structure-design/README.md)
- [同步与事件设计](../design/02-application/03-sync-event-design/README.md)
- [安全设计](../design/03-governance/01-security-design/README.md)
- [部署与运维设计](../design/03-governance/02-deployment-operations-design/README.md)
- [迁移与接入指南](../design/03-governance/03-migration-onboarding-guide/README.md)
- 评审记录：`../design/_drafts/2026-06-29-design-review-v2.md`

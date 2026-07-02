# 统一身份平台实施方案

> 制定日期：2026-07-02
> 依据：[设计文档集](../design/README.md)（12 篇正式设计文档，已通过 2026-06-29 v2 评审，无遗留开放问题）
> 定位：设计文档集描述目标态架构，本方案定义**实施顺序、里程碑、范围裁剪、验收标准和过渡方案**。

## 1. 背景与实施依据

设计侧已具备的资产：

| 资产 | 状态 |
|---|---|
| 12 篇正式设计文档（架构 5 + 应用 4 + 治理 3） | 已通过两轮评审，v2 结论"可以进入实施阶段" |
| 22 项确认设计决议 | 已全部融入正式文档 |
| 15 个高保真 HTML 原型页面（`identity-platform-admin/pages/`） | 可直接作为页面实现依据 |
| 设计库（`.design_library/identity-platform/`：tokens、38 个组件规范、图标） | 前端实现的视觉规范来源 |
| 技术栈 | 全部锁定，见 [总体架构设计 §11](../design/01-architecture/01-overall-architecture/README.md) |

设计文档明确留给实施阶段的五类产物，本方案已排入对应阶段：

| 产物 | 产出阶段 |
|---|---|
| 数据库 DDL | L1（Drizzle schema + migrations） |
| OpenAPI / 接口契约 | L4 |
| Keycloak 实际配置导出 | L0 建立，随实施持续更新 |
| 测试用例 | 每层随层交付 |
| 上线 runbook | L7 |

## 2. 已确认的实施决策

| 决策项 | 结论 |
|---|---|
| 首版上线范围 | **完整开通链路**：登录/SSO + 用户/应用/准入/角色管理 + 注册审批 + 事件同步管道 |
| 开发资源 | 一人 + AI 辅助，按阶段串行推进，无硬性截止时间 |
| 首个接入业务应用 | Supabase 业务应用 |
| 部署目标 | 单机 Docker Compose（开发与首期生产同构） |
| 实施路径 | **分层横切**：按依赖层次自底向上构建，每层配备不依赖上层的可执行验收 |

## 3. 首版范围定义

### 3.1 首版必须包含

覆盖 [总体架构设计 §2](../design/01-architecture/01-overall-architecture/README.md) 定义的核心业务流程：

```text
用户提交注册 -> 平台记录申请 -> 管理员审批 -> 开通账号
  -> 分配应用准入 -> 分配应用角色 -> 同步 Keycloak 与业务应用
  -> 用户登录并进入业务应用（Supabase）
```

按能力分解：

- 认证：OIDC 登录/登出/会话（Auth.js + Keycloak）、注册入口、MFA（Keycloak 承载）。
- 管理后台：用户管理（含禁用/启用/重置密码/重置 MFA）、注册审批、应用目录、应用准入、应用角色分配、Platform Admin RBAC、审计日志查询、基础组织目录。
- 用户门户：门户首页、我的应用、账号中心（资料/安全/会话）。
- 同步管道：Outbox → RabbitMQ（adapter 隔离）→ Worker/Webhook → 对账兜底；撤权/禁用同步强一致，授权/资料最终一致。
- 业务应用接入：Supabase 应用完成 SSO、准入校验、撤权生效、本地用户映射。
- 安全与运维：安全评审清单 17 项闭环、备份恢复演练、基础监控告警、生产 Compose、runbook。

### 3.2 明确裁剪项（二期候选，首版不做）

| 裁剪项 | 依据 |
|---|---|
| 租户模型（`platform_tenants`、`platform_tenant_members`） | 设计标注"仅多租户隔离需求时启用"；表结构随 L1 建立但不开放功能 |
| 国产 MQ 实际适配 | 首版仅保证 `lib/mq` adapter 边界，RabbitMQ 为唯一实现 |
| KingbaseES 实测 | 首版遵守兼容性约定（SQL-first、无 PG 专有特性），双库验证留待信创 POC |
| PII 字段级加密（AES-256-GCM） | 评审定级 P2 |
| 组织 ↔ 业务应用映射投影（`business_app_organization_mappings` 的自动投影） | 表与手工维护首版提供，自动投影随第二个应用接入再做 |
| 业务应用接入 SDK、Monorepo 拆分、独立 Worker 部署 | 设计明确"真实需求出现后再拆" |
| 监控大盘精细化、CSP violation reporting | 首版做基础指标与告警 |

### 3.3 首版数据库表清单（18 张启用 + 2 张预留）

```text
用户与注册：portal_users、registration_requests
应用与授权：applications、application_roles、application_assignments、application_user_roles
组织：platform_organizations、platform_organization_members、business_app_organization_mappings
管理权限：admin_roles、admin_permissions、admin_role_permissions、admin_user_roles
审计：audit_logs（append-only + hash chain）
事件：outbox_events、webhook_deliveries、dead_letter_events、processed_events
预留（建表不启用）：platform_tenants、platform_tenant_members
```

## 4. 总体实施路径

分层横切，L0 → L7 严格按依赖顺序推进。分层路径的固有风险是"集成风险后置"，对冲原则：

1. **每层出口验收必须可执行**：验收以"测试对真实容器"（docker compose 起真实 Keycloak/PostgreSQL/RabbitMQ/Redis 后跑集成测试）为准，不以"代码写完"为准，不等 UI 存在才验证。
2. **登录冒烟前置**：L2 完成时 OIDC 登录链路天然可运行，作为第一个端到端信号。
3. **每层完成即提交**：git 按层留下可回退的稳定点，进度表（§9）同步更新。

```text
L0 基础设施 -> L1 数据层 -> L2 基础能力层 -> L3 服务与任务层
  -> L4 接口层 -> L5 页面层 -> L6 全链路联调与 Supabase 接入 -> L7 安全加固与上线
```

## 5. 各阶段详细计划

### L0 基础设施（概量 3-5 天）

目标：一键可复现的开发环境与可构建的项目骨架。

工作项：

- `deploy/docker/docker-compose.dev.yml`：PostgreSQL（平台库与 Keycloak 库独立 database/账号，逻辑隔离）、Keycloak（外置 DB、健康检查、反代头）、Redis、RabbitMQ（Quorum Queue）、Mailpit（开发 SMTP）。
- `scripts/bootstrap-keycloak-realm.ts`：从零创建 `company-dev` realm、`user-portal` Client（confidential、Standard Flow）、`user-portal-admin-api` Client（Service Account）、三个全局角色（`admin_console_access`、`platform_admin`、`break_glass_admin`）、密码策略、MFA 策略、SMTP 指向 Mailpit；执行后导出 realm JSON 存入仓库。
- Next.js 项目骨架：按 [项目结构设计](../design/02-application/04-project-structure-design/README.md) 建立 `app/ features/ components/ lib/ server/ db/ scripts/ tests/ deploy/` 目录与依赖边界（ESLint 规则约束禁止依赖方向）。
- `scripts/check-env.ts` 与分环境 env 样例；CI：lint + typecheck + test。

交付物：compose 文件、bootstrap 脚本、realm 导出 JSON、空项目骨架、CI。

验收标准：

- `docker compose up` 一次成功拉起全部基础服务且健康检查通过。
- Keycloak 配置可完全脚本重建（删 realm 重跑 bootstrap 结果一致）。
- CI 在空骨架上全绿。

### L1 数据层（概量 5-8 天）

目标：全部表结构、迁移与数据访问基础。

工作项：

- `db/schema/` 按模块拆分定义 §3.3 全部 20 张表（Drizzle ORM）；核心约束：`portal_users.keycloak_sub` 唯一、`processed_events (event_id, consumer)` 唯一、`application_assignments` 投影状态字段（`projection_status`、`business_projection_status` 及错误/时间戳字段）。
- drizzle-kit migrations；`scripts/seed-portal-db.ts`：内置 5 个管理角色（`platform_admin`、`user_admin`、`app_admin`、`auditor`、`support`）、权限清单（`user:disable`、`app:assign`、`audit:view` 等完整 permission code 表）、初始管理员引导（Keycloak 种子管理员 → `portal_users` + `admin_user_roles`）。
- `server/repositories/` 基础读写与分页查询。
- KingbaseES 兼容约定成文（禁用 PG 专有特性清单），作为 code review 检查项。

交付物：完整 DDL（迁移文件即 DDL 交付物）、seed 脚本、repository 层、兼容性约定文档。

验收标准：

- 迁移从零到最新可重复执行且可回滚；seed 幂等。
- repository 单元/集成测试全绿（对真实 PostgreSQL）。
- schema 通过 KingbaseES 兼容约定走查。

### L2 基础能力层 lib/（概量 6-10 天）

目标：认证、Keycloak 集成与全部横切能力。

工作项：

- `lib/auth/`：Auth.js Keycloak Provider（Authorization Code Flow）、session（HttpOnly/Secure/SameSite=Lax）、`require-admin.ts`（token 校验：iss/aud/exp/签名/sub + `admin_console_access` 入口角色）。
- `lib/keycloak/`：`admin-client.ts`（Service Account token 获取与缓存）、`token-client.ts`、`errors.ts`（Keycloak 错误 → 统一错误码转换）、`mappers.ts`（`keycloak_sub` 与 `keycloak_user_id` 语义区分）。
- `lib/http/`：统一响应结构（`data`/`error`/`requestId`）、13 个错误码常量（`UNAUTHENTICATED`、`FORBIDDEN`、`APP_ACCESS_DENIED`、`USER_NOT_FOUND`、`APPLICATION_NOT_FOUND`、`VALIDATION_ERROR`、`CONFLICT`、`KEYCLOAK_ERROR`、`DEPENDENCY_FAILED`、`SYNC_PENDING`、`RATE_LIMITED` 等）、`csrf-check.ts`（SameSite + Origin 校验 + JSON-only）。
- `lib/permissions/`：`can()` / `canWithReason()`，继承规则 global → org → app，`platform_admin` 全权限。
- `lib/audit/`：审计写入（requestId/traceId/operationId、before/after、record_hash 链）。
- `lib/mq/`：adapter 最小接口（publish/consume/ack/nack/healthCheck/close），RabbitMQ 实现。
- `lib/rate-limit/`（Redis 滑动窗口）、`lib/config/`、`lib/validation/`。

交付物：lib 全模块 + 单元测试 + Keycloak 集成测试。

验收标准：

- **登录冒烟**：本地起 Portal，管理员经 Keycloak 完成 OIDC 登录/登出，受保护路由生效。
- admin-client 对真实 Keycloak 的集成测试全绿（建用户、赋角色、禁用、登出会话）。
- CSRF、rate-limit、audit、mq adapter 单测覆盖关键分支。

### L3 服务与任务层 server/（概量 10-15 天）

目标：全部业务用例与 7 个后台任务，核心链路被集成测试证明。

工作项：

- `server/services/`：user-service（创建/禁用/启用/重置密码/重置 MFA；**Keycloak disable 成功才算禁用完成**）、application-service、assignment-service（授予最终一致、**撤销以 Keycloak Client Role 移除成功为关键完成点**，覆盖 200/202/409/502/424 五种结果语义）、app-role-service、registration-service（pending/approved/rejected/cancelled 状态机；审批通过 → 创建/启用 Keycloak 用户 → 写 `portal_users`）、organization-service、admin-rbac-service、audit-service。
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

### L4 接口层 app/api/（概量 8-12 天）

目标：约 57 个端点全部可用，契约成文。

工作项：

- 四组前缀：`/api/admin/*`（用户 8 + 注册审批 4 + 组织 9 + 应用 4 + 准入 3 + 应用角色 6 + 管理角色权限 5 + 审计 1）、`/api/public/*`（注册申请提交等）、`/api/account/*`（profile、apps、sessions）、`/api/internal/*`（同步/健康）；另有 `/api/health`、`/api/auth/[...nextauth]`。
- 统一接线：CSRF 中间件、三层权限校验前两层、审计写入、`Idempotency-Key` 支持（创建用户、分配应用、禁用用户等写操作）、列表统一分页参数（`page/pageSize/keyword/sort/order/filters`）。
- 速率限制：登录 5 次/分钟（IP+账号）、注册 10 次/小时（IP）、找回密码 3 次/小时、管理 API 100 次/分钟（用户）、Webhook 60 次/分钟（应用）；不暴露剩余次数。
- OpenAPI 3.0 文档生成与发布。

交付物：全部 Route Handler、OpenAPI 契约、API 集成测试。

验收标准：

- 每个端点具备契约测试；未登录（401）/越权（403）/参数错误（400）/冲突（409）路径全覆盖。
- 审计断言：每个管理写操作产生一条审计记录。
- 撤权接口按状态机返回 200/202/409/502/424。

### L5 页面层 app/ + features/（概量 12-18 天）

目标：约 24 个页面，对照原型与设计库实现。

工作项：

- 组件底座：shadcn/ui + Tailwind 按设计库 tokens（`ui-base-tokens.css`/`colors_and_type.css`）定制主题；data-table（TanStack Query 分页/筛选/批量操作）、表单（React Hook Form + Zod，与 `features/*/schemas.ts` 共享）、危险操作确认（二次确认 + 近期认证）。
- 管理后台 12 页：概览、用户列表/新建/详情（7 个 Tab + 危险操作区）、注册审批、注册配置、组织、应用列表/详情、角色权限、审计日志、系统设置。
- 账号中心 4 页：资料、安全、会话、已授权应用。
- 公共与门户：登录、注册、错误/403、用户门户首页、我的应用。
- 注册入口默认**模式 A（Keycloak 托管注册）**；L5 走查 `register.html` 原型后如确认需要自定义表单体验，切换模式 B（Next.js 表单 + 服务端校验），预估增量 2-3 天。

交付物：全部页面 + Playwright e2e。

验收标准：

- 逐页对照 15 个原型走查（布局、状态、危险操作交互一致）。
- e2e 覆盖四条关键流程：登录、用户禁用、准入授予/撤销、注册审批。
- 前端仅做体验层权限隐藏，权限判定全部来自服务端。

### L6 全链路联调 + Supabase 接入（概量 5-8 天）

目标：真实业务应用经由平台完成完整开通链路。

工作项：

- 端到端演练：注册 → 审批 → 开通 → 准入 → 角色 → 同步 → 登录 Supabase 应用。
- Supabase 应用接入（按 [迁移与接入指南](../design/03-governance/03-migration-onboarding-guide/README.md) 十步流程）：创建 `supabase-business-app` Client 与 `supabase_app_access` Client Role；应用侧校验 `resource_access[client_id].roles`（401 `UNAUTHENTICATED` / 403 `APP_ACCESS_DENIED`）；建立 `keycloak_sub → 本地用户` 映射；接入 Webhook 消费（签名验证 + 幂等）；连通性测试工具。
- 平台侧 `applications` 登记、准入投影验证、撤权生效验证。
- 将接入过程沉淀为可复用接入文档（后续应用直接套用）。

交付物：Supabase 接入完成、通用接入文档、接入验收清单。

验收标准：

- 接入验收清单 10/10（Client 配置、token 校验、映射唯一、回滚方案、禁用同步、审计可查、权限边界、准入投影、撤权投影、测试报告）。
- 撤权后：token 刷新不再含 Client Role，业务侧拒绝访问，平台侧对账无差异。

### L7 安全加固与上线（概量 5-8 天）

目标：满足安全设计全部上线阻塞项，生产环境就绪。

工作项：

- [安全设计](../design/03-governance/01-security-design/README.md) §16 评审清单 17 项逐项闭环（Secret 管理、Token/Cookie、CSRF、XSS/CSP、CORS、SSRF、防枚举、速率限制、越权防护、高风险操作、审计、网络边界、Keycloak 可用性与降级）。
- Keycloak 降级策略落地验证："已持有 token 继续用、新登录 503、准入缓存仅拒绝不放行、恢复后全量对账"。
- 验证码（Turnstile/hCaptcha）接入登录/注册（可配置开关）。
- 生产 `docker-compose.prod.yml`：HTTPS/反代、secrets 注入、资源限制、日志采集。
- 备份与恢复：Keycloak DB 每日 + realm 每周导出、平台 DB 每日（保留 30 天 + 月度）、恢复演练一次成功（RTO 30 分钟 / RPO 当天事件不丢）。
- 监控告警基础版：事件积压（>1000 告警）、死信增长、Webhook 失败率（>1%）、投影失败、登录失败率、证书过期。
- 5 份 runbook：deployment、rollback、keycloak-client-secret-rotation、database-backup-restore、incident-response；break_glass 应急预案。

交付物：生产部署、runbooks、监控告警、安全清单记录。

验收标准（即首版上线门槛）：

- 安全清单 17/17 通过并留档。
- 恢复演练成功；高风险对账连续运行无差异。
- 端到端链路在生产环境复验通过。

## 6. 测试策略

| 层级 | 范围 | 工具 | 引入阶段 |
|---|---|---|---|
| 单元测试 | lib、services 纯逻辑、权限继承、签名/幂等算法 | Vitest | L1 起 |
| 集成测试 | repository、Keycloak Admin API、事件管道、对账 | Vitest + 真实容器（compose） | L1 起，L3 为主战场 |
| 契约测试 | 全部 API 端点、错误码、撤权状态机 | Vitest（HTTP 层） | L4 |
| E2E | 登录、禁用、准入授予/撤销、注册审批 | Playwright | L5 |

测试重点按设计风险排序：撤权链路（5 态）、禁用完成点语义、幂等（API/MQ/Webhook 三层）、对账修复、权限越权路径。

## 7. 风险与对策

| 风险 | 等级 | 对策 |
|---|---|---|
| 分层路径集成风险后置 | 高 | 每层验收对真实容器执行；L2 登录冒烟、L3 链路集成测试提前暴露集成问题 |
| 撤权/禁用多系统一致性 | 高 | 严格按决议实现完成点语义；L3 故障演练列为验收项 |
| Keycloak Admin API 不可用 | 高 | 统一错误转换 + 降级策略（L7 验证）+ break_glass 预案 |
| 事件丢失 / 重复消费 | 高 | Outbox 事务写入 + 幂等表 + 对账兜底，三层机制在 L3 一次建成 |
| 单人开发节奏中断 | 中 | 每层出口 git 稳定点 + 进度表（§9），任意中断可从层边界恢复 |
| 页面工作量超预期 | 中 | 原型与设计库已备齐；若超期，账号中心 4 页与系统设置页可移出首版（不阻塞开通链路） |
| 注册模式 A/B 摇摆 | 低 | 默认模式 A，L5 走查原型后一次性决策，增量已预估 |

## 8. 交付物汇总

| 交付物 | 阶段 | 位置 |
|---|---|---|
| Docker Compose（dev/prod） | L0 / L7 | `deploy/docker/` |
| Keycloak bootstrap 脚本 + realm 导出 | L0 起持续 | `scripts/`、`deploy/keycloak/` |
| 数据库 DDL（migrations）+ seed | L1 | `db/migrations/`、`scripts/` |
| OpenAPI 契约 | L4 | `docs/references/`（生成发布） |
| 测试套件（unit/integration/contract/e2e） | 每层 | `tests/` |
| Supabase 接入文档（通用化） | L6 | `docs/guides/` |
| Runbooks（5 份） | L7 | `deploy/runbooks/` |
| 监控告警配置 | L7 | `deploy/` |

## 9. 里程碑进度表

| 阶段 | 概量 | 状态 | 完成日期 |
|---|---|---|---|
| L0 基础设施 | 3-5 天 | 未开始 | - |
| L1 数据层 | 5-8 天 | 未开始 | - |
| L2 基础能力层 | 6-10 天 | 未开始 | - |
| L3 服务与任务层 | 10-15 天 | 未开始 | - |
| L4 接口层 | 8-12 天 | 未开始 | - |
| L5 页面层 | 12-18 天 | 未开始 | - |
| L6 联调与 Supabase 接入 | 5-8 天 | 未开始 | - |
| L7 安全加固与上线 | 5-8 天 | 未开始 | - |

总概量约 54-84 个工作日（单人 + AI 辅助，约 3-4 个月）。状态随实施更新，每层完成时在本表记录日期与对应 commit。

## 10. 上线后演进（二期候选）

- 启用租户模型与组织映射自动投影（随第二个业务应用接入评估）。
- KingbaseES 双库验证 POC 与国产 MQ adapter 实现（信创落地时）。
- PII 字段级加密、CSP reporting、监控大盘精细化。
- 业务应用接入 SDK 与标准化样例。
- Worker 拆分独立部署（触发条件：后台任务负载影响 Portal 资源或需独立扩缩容）；Monorepo 拆分（触发条件：多前端共享组件或权限中心独立服务需求出现）。
- 旧系统用户迁移按 [迁移与接入指南](../design/03-governance/03-migration-onboarding-guide/README.md) 的 `dual_login → keycloak_default → legacy_disabled → legacy_removed` 状态机执行。

## 11. 参考

- [设计文档集](../design/README.md)
- [总体架构设计](../design/01-architecture/01-overall-architecture/README.md)
- [项目结构设计](../design/02-application/04-project-structure-design/README.md)
- [同步与事件设计](../design/02-application/03-sync-event-design/README.md)
- [安全设计](../design/03-governance/01-security-design/README.md)
- [部署与运维设计](../design/03-governance/02-deployment-operations-design/README.md)
- [迁移与接入指南](../design/03-governance/03-migration-onboarding-guide/README.md)
- 评审记录：`../design/_drafts/2026-06-29-design-review-v2.md`

# 统一身份平台设计变更 Review（v2）

> 评审日期：2026-06-29
> 评审对象：根据 v1 Review 意见修改后的设计文档（commit `5a46334`）
> 涉及文档：
> - [用户与权限模型设计](../01-architecture/04-user-permission-model/)
> - [同步与事件设计](../02-application/03-sync-event-design/)
> - [项目结构设计](../02-application/04-project-structure-design/)
> - [安全设计](../03-governance/01-security-design/)
> - [部署与运维设计](../03-governance/02-deployment-operations-design/)

---

## 1. 总体评价

**修改质量优秀，几乎所有 P0 和 P1 评审意见都得到了妥善响应。**

主要变更覆盖了以下领域：
- Platform Admin RBAC 模型细化（权限结构、继承规则、校验位置）
- Webhook 安全验证机制（签名、防重放、重试、连通性测试）
- 事件版本演进策略
- ORM 选型（Drizzle ORM）
- 前端状态管理方案（TanStack Query + React Hook Form）
- 后台任务队列（BullMQ + Redis）
- CSRF 防护方案
- 速率限制方案
- Keycloak 不可用降级策略
- 平台权限中心物理形态明确
- 部署拓扑和数据库架构调整

---

## 2. 逐文档 Review

### 2.1 用户与权限模型设计

#### 变更内容

- 新增 §9 **Platform Admin RBAC 模型**，完整包含：
  - 权限结构（`AdminPermission`、`AdminRole`）
  - 权限检查函数签名
  - 权限继承规则（global → org → app）
  - 校验位置（Route Handler / Service / UI 三层）
  - 内置角色定义

#### Review 意见

| 项目 | 评价 |
|---|---|
| **完整性** | ✅ 完整覆盖了评审建议中的权限模型、校验函数、继承规则和校验位置 |
| **边界清晰** | ✅ `platform_admin` 自动拥有所有权限的设计合理，避免了超级管理员的角色管理复杂度 |
| **三层校验** | ✅ Route Handler 入口层、Service 层、UI 层的校验位置描述准确，特别是强调"UI 仅作体验优化" |

**建议微调**：

1. **权限检查函数的返回值建议增加原因说明**：
   当前 `can()` 返回 boolean，但在实际开发中，拒绝时通常需要告诉用户为什么被拒绝。建议增加一个返回详情的变体：
   ```typescript
   function canWithReason(
     adminSub: string,
     permissionCode: string,
     scope?: { type: 'org' | 'app', id: string }
   ): { allowed: boolean; reason?: string; requiredScope?: string }
   ```
   或者至少说明：权限拒绝时返回统一的 `403 FORBIDDEN`，不暴露具体缺少哪个权限（防止枚举管理员权限结构）。

2. **内置角色的删除限制**：
   `platform_admin` 标注了"内置，不可删除"，但其他内置角色（`user_admin`、`app_admin` 等）是否可以删除？建议明确说明。

**结论**：✅ **通过**，第 1 条建议为可选增强，第 2 条建议补充一句话即可。

---

### 2.2 同步与事件设计

#### 变更内容

- 补充了 Keycloak 事件消费可靠性的说明
- 新增 §6.1 **事件数据表设计**（outbox_events、webhook_deliveries、dead_letter_events、processed_events）
- 新增 §6.2 **Webhook 安全验证**（签名机制、业务应用端验证、投递保障、连通性测试）
- 新增 §11.1 **事件版本演进策略**

#### Review 意见

| 项目 | 评价 |
|---|---|
| **事件表设计** | ✅ 四张表的结构完整，`trace_id` 和 `operation_id` 贯穿所有表 |
| **Webhook 签名** | ✅ HMAC-SHA256 + timestamp + eventId 的组合足够安全 |
| **Webhook 重试** | ✅ 指数退避（1s、5s、30s、2min、10min）合理，最多 5 次 |
| **连通性测试** | ✅ 提供了接入时测试机制，降低接入成本 |
| **事件版本** | ✅ 消费者忽略未知字段、不认识版本进入死信的规则合理 |

**建议微调**：

1. **§11.1.1 版本号规则中，eventVersion 为整数对应 major 版本**：
   这里的设计是 `eventVersion` 为整数（即只有 major），minor 通过新增可选字段隐式演进。这个设计是可行的，但建议补充一句话说明：
   > `eventVersion` 为整数是因为 minor 版本变更通过新增可选字段实现，不需要改变版本号。如果未来需要表达更细粒度的版本（如 breaking patch），可以再扩展为字符串格式。

2. **Webhook 签名中的 payload 格式**：
   签名是 `HMAC-SHA256(secret, timestamp + '.' + payload)`，这里 `payload` 应该是原始请求体（raw body），而不是解析后的 JSON 对象（否则 JSON 序列化顺序不同会导致签名不匹配）。建议明确：
   > `payload` 为原始请求体字符串（raw body），确保签名计算与 JSON 解析无关。

3. **幂等性表的唯一约束**：
   `processed_events` 表应该有一个唯一约束 `(event_id, consumer)`，防止同一消费者重复处理。建议在表结构说明中补充。

**结论**：✅ **通过**，三条建议均为文档补充，不影响架构正确性。

---

### 2.3 项目结构设计

#### 变更内容

- 新增前端状态管理方案（TanStack Query + React Hook Form + Context）
- 明确使用 Drizzle ORM（含选型对比表和推荐理由）
- 新增 §13.1 **任务队列实现**（BullMQ + Redis）
- 新增 §13.2 **部署形态**

#### Review 意见

| 项目 | 评价 |
|---|---|
| **ORM 选型** | ✅ Drizzle ORM 选型理由充分，对比表覆盖了所有关键维度 |
| **前端状态管理** | ✅ TanStack Query + React Hook Form + Zod 的组合是 Next.js 项目的黄金搭档 |
| **BullMQ + Redis** | ✅ 与 RabbitMQ 职责分工清晰（BullMQ 负责任务调度，RabbitMQ 负责事件分发） |
| **代码解耦** | ✅ 强调任务逻辑写成纯函数、不耦合 Next.js runtime |

**建议微调**：

1. **Drizzle ORM 的 schema 文件位置**：
   文档中使用了 `migrations/` 目录存放迁移文件，但没有说明 Drizzle 的 schema 文件放在哪里。建议明确：
   ```text
   db/
   ├─ schema.ts          # Drizzle schema 定义
   ├─ index.ts           # 数据库连接导出
   └─ migrations/        # drizzle-kit 生成的迁移文件
   ```
   或者如果使用 `server/repositories/` 模式，schema 可以放在 `db/schema/` 下按模块拆分。

2. **BullMQ 的 Redis 与 RabbitMQ 的区别**：
   文档中已经说明了职责分工，但建议再增加一句话说明为什么需要两个队列系统：
   > BullMQ 用于内部任务调度（定时任务、重试、并发控制），RabbitMQ 用于跨服务事件分发和国产化适配。两者不互相替代。

**结论**：✅ **通过**，两条建议为文档补充。

---

### 2.4 安全设计

#### 变更内容

- 重写 §6 **CSRF 防护**，明确采用 SameSite Cookie + Origin 校验 + JSON-only 的组合方案
- 新增 §10.1 **速率限制**（分层限制规则、Redis 滑动窗口、验证码）
- 新增 §15.1 **Keycloak 不可用时的降级策略**

#### Review 意见

| 项目 | 评价 |
|---|---|
| **CSRF 方案** | ✅ 非常详细，覆盖了 Cookie 设置、API 防护、Server Actions、Route Handlers |
| **SameSite=Lax 解释** | ✅ 解释了为什么不使用 Strict（避免外部链接跳转失效），考虑周到 |
| **速率限制** | ✅ 分层规则合理，不暴露剩余次数（防枚举） |
| **验证码推荐** | ✅ Cloudflare Turnstile 或 hCaptcha，避免了自研验证码的复杂度 |
| **降级策略** | ✅ 这是本次修改中最出色的补充之一 |

**特别肯定：Keycloak 降级策略**

§15.1 的设计非常出色，特别是"**仅拒绝**"原则：
```text
本地准入缓存只用于加强拒绝，不用于放行。
```

这个原则从根本上避免了降级期间的安全漏洞。三个维度的降级（认证侧、准入校验、管理侧）覆盖全面，恢复流程也考虑了对账和审计。

**建议微调**：

1. **速率限制的 Redis Key 设计**：
   建议补充 Redis Key 的命名规范，例如：
   ```text
   rate_limit:login:{ip}:{username_hash}
   rate_limit:register:{ip}
   rate_limit:admin_api:{user_id}
   rate_limit:webhook:{app_id}
   ```
   使用 `username_hash` 而不是明文用户名，避免 Redis Key 泄露用户信息。

2. **CSRF 校验失败返回码**：
   文档说"任一校验失败返回 403"，但 403 是 `Forbidden`，通常表示权限不足。CSRF 校验失败建议返回 `403` 也可以接受（因为 CSRF 本质上是一种未授权的请求），但可以补充说明与权限不足的 403 区分方式（如通过 error code）。

3. **安全评审清单补充**：
   新增的条目很好。建议再增加一条：
   ```text
   速率限制 Redis 配置正确
   ```

**结论**：✅ **通过**，建议均为可选增强。

---

### 2.5 部署与运维设计

#### 变更内容

- 明确平台权限中心是 Next.js 门户内的服务端逻辑模块
- 合并 Portal/Authz/Audit/Outbox 为共用数据库集群（逻辑隔离）
- 新增 Redis 用于 BullMQ 和速率限制
- 新增部署单元说明表格

#### Review 意见

| 项目 | 评价 |
|---|---|
| **平台权限中心形态** | ✅ 明确为 Next.js 门户内的逻辑模块，解决了评审中的核心疑问 |
| **数据库架构** | ✅ 共用集群 + 逻辑隔离（独立 schema 或独立账号），兼顾了成本和安全 |
| **部署单元表格** | ✅ 清晰列出了所有部署单元和职责 |
| **Redis 定位** | ✅ 明确用于 BullMQ 和速率限制，不存储持久化业务数据 |

**建议微调**：

1. **Redis 的持久化需求**：
   文档说"Redis 不存储持久化业务数据"，但 BullMQ 的任务状态和速率限制计数在 Redis 重启后会丢失。建议说明：
   - BullMQ 任务队列如果任务量不大，可以接受 Redis 重启后丢失（任务会重新触发或由对账兜底）
   - 或者启用 Redis AOF 持久化（按业务容忍度决定）
   - 速率限制计数丢失的影响较小（计数重置后短期内可能多允许几次请求）

2. **Worker 的部署说明**：
   文档提到 Worker 是"可选独立部署"，建议补充触发条件：
   > 当后台任务负载导致 Next.js Portal 实例资源紧张时，或需要独立扩缩容时，将 Worker 拆分为独立部署单元。

**结论**：✅ **通过**，建议为文档补充。

---

## 3. 遗留问题与待确认项

### 3.1 已解决项（来自 v1 Review）

| v1 建议 | 状态 | 对应文档 |
|---|---|---|
| 明确 ORM 选型（Drizzle ORM） | ✅ 已解决 | 项目结构设计 |
| 明确部署目标（Node.js Runtime） | ✅ 已解决 | 项目结构设计、部署与运维设计 |
| 文档同步：统一 Keycloak 角色口径 | ⚠️ 需确认 | 待检查 Keycloak 配置设计文档 |
| 明确 CSRF 防护方案 | ✅ 已解决 | 安全设计 |
| Webhook 签名验证机制 | ✅ 已解决 | 同步与事件设计 |
| 速率限制方案 | ✅ 已解决 | 安全设计 |
| Platform Admin RBAC 的 scope 规则细化 | ✅ 已解决 | 用户与权限模型 |
| Keycloak 高可用部署方案 | ✅ 已解决 | 部署与运维设计、安全设计（降级策略） |
| 事件版本演进策略 | ✅ 已解决 | 同步与事件设计 |
| 明确平台权限中心的物理形态 | ✅ 已解决 | 部署与运维设计 |

### 3.2 仍需确认项

#### 3.2.1 Keycloak 配置设计文档的角色口径 —— 详细说明

**问题本质**：这是一个**文档维护问题**，而非架构设计问题。正式文档的口径已经是正确的，但"待讨论设计问题"草稿文档没有跟进更新，导致信息不同步。

**背景**：

在[待讨论设计问题](file:///Users/biao/Code/Biaoo-projects/identity-platform/docs/design/_drafts/2026-06-26-open-design-questions.md#L9-L13)中，记录了这样一个条目：

> "Keycloak 配置文档仍把 `user_admin`、`app_admin`、`auditor`、`support` 写成 Realm Roles。已确认决策中 Keycloak 只保留 `admin_console_access`、`platform_admin`、`break_glass_admin`。"

这个条目的意思是：团队内部已确认 Keycloak 中只放 3 个 Realm Role，日常管理角色放到 Platform Admin RBAC 本地数据库中，但这个决策可能还没同步到所有正式文档。

**当前状态核查**：

我查看了 [Keycloak 配置设计文档](file:///Users/biao/Code/Biaoo-projects/identity-platform/docs/design/01-architecture/05-keycloak-configuration-design/README.md#L80-L96)的 §6 Realm Roles，发现**实际上已经同步好了**：

```text
Keycloak Realm Role 只保留管理后台入口、最高管理员种子身份和紧急恢复身份：
admin_console_access
platform_admin
break_glass_admin

日常管理角色，例如 user_admin、app_admin、auditor、support，
属于 Platform Admin RBAC 的本地角色，不放在 Keycloak Realm Role 中。
```

**真正的问题**：

"待讨论设计问题"文档第 10 行仍然写着"Keycloak 配置文档仍把...写成 Realm Roles"，这句话**已经过时了**。这会导致：

- 后来者看到待讨论问题文档，误以为 Keycloak 配置设计文档还有口径问题
- 可能引发重复的审阅和讨论
- 文档之间出现"已解决但仍记录为待解决"的矛盾

**建议处理**：

更新[待讨论设计问题文档](file:///Users/biao/Code/Biaoo-projects/identity-platform/docs/design/_drafts/2026-06-26-open-design-questions.md)，将以下内容从"待继续确认的问题"中移除（或移到"已解决事项"部分）：

| 待讨论问题中的条目 | 解决状态 | 对应正式文档位置 |
|---|---|---|
| Keycloak 角色口径（只保留3个 Realm Role） | ✅ 已同步 | [Keycloak 配置设计 §6](file:///Users/biao/Code/Biaoo-projects/identity-platform/docs/design/01-architecture/05-keycloak-configuration-design/README.md#L80-L96) |
| 业务应用准入校验契约 | ✅ 已同步 | [总体架构设计 §12](file:///Users/biao/Code/Biaoo-projects/identity-platform/docs/design/01-architecture/01-overall-architecture/README.md#L531-L559) |
| Group 用途措辞 | ✅ 已同步 | [Keycloak 配置设计 §8](file:///Users/biao/Code/Biaoo-projects/identity-platform/docs/design/01-architecture/05-keycloak-configuration-design/README.md#L119-L139) |
| 事件链路 ID 字段契约 | ✅ 已同步 | [同步与事件设计 §6.1](file:///Users/biao/Code/Biaoo-projects/identity-platform/docs/design/02-application/03-sync-event-design/README.md) |

需要保留的可能是撤权 API 状态机（如果 API 设计文档还未更新）。

#### 3.2.2 前端页面原型文件

commit 中还新增了多个 HTML 页面文件（`identity-platform-admin/pages/*.html`）和图标资源，这些应该是前端设计稿，需要确认是否属于设计文档集的一部分，还是需要单独 Review。

---

## 4. 结论

### 4.1 综合结论

**本次设计变更质量优秀，可以认为所有 P0 和 P1 评审意见均已得到妥善解决。**

特别值得肯定的改进：
1. **Keycloak 不可用降级策略**（安全设计 §15.1）："仅拒绝"原则非常专业
2. **Webhook 安全验证机制**（同步与事件设计 §6.2）：签名、防重放、重试、连通性测试全覆盖
3. **Platform Admin RBAC 模型**（用户与权限模型 §9）：权限结构、继承规则、校验位置完整
4. **部署拓扑明确化**（部署与运维设计 §2）：平台权限中心形态、数据库架构、部署单元全部清晰

### 4.2 下一步建议

1. **检查 Keycloak 配置设计文档的角色口径**，确保与已确认决策一致
2. **更新待讨论设计问题文档**，标记已解决项
3. **处理本文档中的"建议微调"项**（均为文档补充，不影响架构）
4. **确认前端 HTML 页面文件是否需要 Review**
5. **完成后可以进入实施阶段**

---

## 5. 变更文档列表

| 文档 | 变更摘要 | Review 结论 |
|---|---|---|
| [用户与权限模型设计](../01-architecture/04-user-permission-model/README.md) | 新增 Platform Admin RBAC 完整模型 | ✅ 通过 |
| [同步与事件设计](../02-application/03-sync-event-design/README.md) | 新增事件表、Webhook 签名、版本演进 | ✅ 通过 |
| [项目结构设计](../02-application/04-project-structure-design/README.md) | 明确 Drizzle ORM、前端状态管理、BullMQ | ✅ 通过 |
| [安全设计](../03-governance/01-security-design/README.md) | 新增 CSRF、速率限制、Keycloak 降级策略 | ✅ 通过 |
| [部署与运维设计](../03-governance/02-deployment-operations-design/README.md) | 明确权限中心形态、数据库架构、部署单元 | ✅ 通过 |

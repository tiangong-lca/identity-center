# L3 服务与任务层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans。

**Goal:** 全部业务用例(services/policies)与 7 个后台任务,核心链路被对真实容器的集成测试证明(含故障演练)。

**Architecture:** services 接收注入的 `ServiceContext { db, keycloak, now() }`(可测);**平台事实变更与 outbox_events 同一事务写入**;任务逻辑为纯函数(`server/jobs/*`),BullMQ 仅做调度接线(`scripts/worker.ts`),测试直接调用任务函数;审计经 audit-log-repository(hash 链)+ lib/audit 上下文。

**Tech Stack:** BullMQ 5.79.x(查证 2026-07-02)。

**一致性语义(硬约束,GOAL §4.4):**
- 用户禁用:Keycloak disable **成功才算完成**(同步),随后镜像 portal_users + outbox 事件 + 会话登出。
- 准入撤销:平台状态立即 revoked,但**以 Keycloak Client Role 移除成功为关键完成点**——同步尝试投影:成功→200(revoked+projected);KC 4xx 冲突→409;KC 不可达→502(状态保持 revoked+projection failed,进入重试与告警);业务侧投影未确认→202/424 语义由 API 层(L4)映射。
- 授予/资料/角色:最终一致(事实+outbox 同事务,异步投影)。

## Stage A — services 与 policies

### A1 outbox 写入器 + ServiceContext
- `server/services/context.ts`:`ServiceContext { db: DbClient['db']; keycloak: KeycloakAdmin }` 与 `createServiceContext()`(生产装配)。
- `lib/sync/outbox.ts`:`appendOutboxEvent(tx, { eventType, payload, traceId?, operationId? })`——事件含 `eventId(evt_*)、eventVersion:1、occurredAt`;payload camelCase。12 类事件类型常量表 `lib/sync/event-types.ts`。
- 单测:事件结构、事务内失败回滚(与 A2 集成测试一并验证)。

### A2 user-service
- `create`(KC 创建用户[临时密码] → portal_users 镜像 → outbox identity.user.created → 审计 user.create;KC 成功后 DB 事务,DB 失败时补偿删除 KC 用户)。
- `disable`(KC disable 成功 → 事务[镜像 status+outbox identity.user.disabled] → KC 会话登出 → 审计;KC 失败直接抛错不落库)。`enable` 对称。
- `resetPassword`/`resetMfa`(KC 操作 + 审计,不改事实表)。
- `get`/`list`(repo 透传)。
- 集成测试:创建→禁用→启用全链路断言(KC 状态、DB 镜像、outbox 行、审计行)。

### A3 application-service + app-role-service
- 应用登记 `create`(写 applications + **确保 KC Client 存在 + 确保 access client role 存在**)、`update`、`get`/`list`。
- 角色目录 CRUD(application_roles,唯一 (app,code))。
- 集成测试:登记应用→KC 中 client role 已建。

### A4 assignment-service(准入,风险核心)
- `grant`:事务[assignments upsert(active,pending)+outbox access.application.granted]→**同步尝试** KC client role 授予:成功→projected;失败→保持 pending 交由重投影任务。重复授予幂等(unique 约束+状态机)。
- `revoke`:事务[status=revoked+outbox access.application.revoked]→同步 KC 移除:成功→ `{ outcome: 'revoked' }`;KC 不可达→ `{ outcome: 'projection_failed' }`(供 L4 映射 502);目标已不存在→按成功处理。
- `listByApplication`/`listByUser`。
- 集成测试:授予→token 侧角色存在(经 admin 查询)→撤销→角色消失;撤销时停 KC?(KC 是 compose 服务,停/启成本高——用错误注入:传入 fake keycloak 端口的 admin 实例模拟不可达,断言 projection_failed 且事实=revoked)。

### A5 application-user-role-service
- `assign`/`revoke`(事实+outbox application.role.assigned/revoked;投影到业务应用为异步 Webhook,不碰 KC)。scope 归一化(''=global)。
- 集成测试:分配/撤销幂等与事件行。

### A6 registration-service
- `submit`(公共入口:写 registration_requests[pending];频控与验证码在 L4 接线)。
- `approve`(事务外先 KC ensure 用户[邮箱验证邮件由 KC 发送]→事务[request→approved+portal_users 镜像+outbox identity.user.created]→审计 registration.approve)。
- `reject`/`cancel`(状态机守卫:仅 pending 可流转,violate→CONFLICT)。
- 集成测试:submit→approve→用户可查;非法流转 409。

### A7 organization-service + tenant-service + admin-rbac-service + policies
- 组织 CRUD+成员增删(唯一约束幂等);映射表维护(business_app_organization_mappings)。
- tenant-service:CRUD(配置开关 `TENANTS_ENABLED`,默认关——关闭时服务返回 FORBIDDEN)。
- admin-rbac-service:角色 CRUD(内置角色不可删)、权限清单查询、角色赋权/移除、管理员绑定/解绑。
- `server/policies/admin-policy.ts`:`loadGrants(db, keycloakSub)`(admin_user_roles join 角色权限 → AdminGrant[])+ `requirePermission(ctx, sub, code, scope?)`(调 lib/permissions,拒绝抛 FORBIDDEN 并审计 denied)。
- 集成测试:授予 user_admin(org 范围)→ 检查 can 矩阵;内置角色删除被拒。

## Stage B — 任务管道(7 任务)

### B1 任务纯函数骨架 + BullMQ 接线
- `server/jobs/types.ts`:`JobContext { db, mq, keycloak, redis }`。
- `scripts/worker.ts`:BullMQ Queue/Worker 注册 7 任务(repeatable:dispatch 5s、webhook 10s、死信重试 5min、对账高风险 1h/资料 24h/全量 7d——间隔从 env 可调)+ 优雅退出。dev 下 `pnpm worker` 启动。
- 就绪测试:enqueue 一次性 job → worker 处理(轻量冒烟)。

### B2 dispatch-outbox-events
- 批量取 pending(FOR UPDATE SKIP LOCKED,batch 100)→ mq.publish(topic=eventType)→ published/attempts++;发布失败 attempts>=5 → failed + dead_letter_events(source=outbox)。
- 集成测试:插事实+outbox → dispatch → MQ 消费者收到;MQ 断连(fake url adapter)→ 进 failed/死信。

### B3 project-keycloak-assignments(重投影)
- 扫 assignments projection_status=pending/failed(active→授予,revoked→移除)→ KC 操作 → projected;attempts 语义复用 last_projection_error。
- 集成测试:人工制造 pending(A4 错误注入产物)→ 任务修复 → projected。

### B4 deliver-webhooks + 签名
- `lib/sync/webhook-signature.ts`:`sign(secret, timestamp, rawBody)` → `sha256=base64(HMAC-SHA256(secret, timestamp + '.' + rawBody))`;`verify(...)`(±300s 窗口)。
- 消费 MQ 事件(queue `identity.webhook-deliveries` 绑定 12 类 topic)→ 为每个订阅应用写 webhook_deliveries(pending)→ 投递任务按 next_retry_at 发 POST(头:X-Webhook-Signature/X-Webhook-Timestamp/X-Webhook-Event-Id/X-Webhook-Event-Type)→ 2xx→delivered;失败退避 1s/5s/30s/2min/10min → 5 次后 dead + dead_letter_events + 告警日志。幂等:processed_events (eventId, `webhook:{appCode}`)。
- 集成测试:本地 http 服务作为订阅方(vitest 内起 node http server):验证签名正确、重试(先 500 两次再 200)、5 连败进 dead。

### B5 reconcile-keycloak-users / reconcile-application-projections
- 用户对账:遍历 portal_users(分页)对比 KC enabled ↔ status(disabled 不一致→**以平台为准修 KC** + 记录差异行);孤儿(KC 无此用户)→ 标记 sync_status=failed 并告警日志。
- 准入对账:active assignments ↔ KC client role 实际;缺→补投影,多→移除(以平台事实为准);差异计数返回。
- 集成测试:人为制造两类漂移→对账修复→复查无差异。
- `reconcile-audit-full`(每周全量)并入准入对账的全量模式参数。
- retry-dead-letter-events:重放死信(仅 outbox/webhook 源;attempts 上限后保留人工)。
- sync-application-assignments:即 MQ 消费侧对 granted/revoked 事件驱动 B3 逻辑(事件驱动)+ B3 定时兜底,同一实现两个触发器。

### B6 故障演练(层验收)
- 演练 1:MQ 不可达(错误 URL adapter)→ outbox 积压 → 恢复(真 adapter)→ dispatch 补发全部。
- 演练 2:KC 投影漂移(直接改 KC 删角色)→ 对账修复。
- 演练 3:webhook 端点 5 连败 → dead → 修复端点 → retry-dead-letter 重放成功。

### B7 收尾
- lint/typecheck/unit/integration 全绿;进度表 L3;commit+push。

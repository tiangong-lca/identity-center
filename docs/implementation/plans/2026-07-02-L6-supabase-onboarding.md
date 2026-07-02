# L6 全链路联调 + Supabase 接入 Implementation Plan

**Goal:** 真实业务应用(Supabase)经平台完成完整开通链路;沉淀通用接入文档与验收清单;端到端演练(注册→审批→开通→准入→角色→同步→登录→撤权生效)以自动化测试证明。

**关键事实:** Supabase 应用是**外部业务系统**,不在本仓内。L6 平台侧交付:
1. Keycloak `supabase-business-app` Client + `supabase_app_access` Client Role(bootstrap 脚本纳入)。
2. 平台 `applications` 登记 Supabase(seed 或运行时)。
3. 业务侧接入契约的**可运行参考实现**(轻量 verifier:校验 `resource_access[client_id].roles` + Webhook 签名验证),作为接入方样例并纳入测试。
4. 端到端联调测试:整条链路 + 撤权后业务侧拒绝 + 对账无差异,用集成测试固化(以参考 verifier 代替真实 Supabase)。
5. 存量用户迁移工具化:批量盘点匹配脚本(优先级:外部ID>已验证邮箱>手机>username>人工),映射记录。
6. 通用接入文档 `docs/guides/business-app-onboarding.md` + 接入验收清单。

## Tasks

### T1 bootstrap 纳入 supabase client + 接入 seed
- bootstrap-keycloak-realm.ts:增设 `supabase-business-app` client(confidential,redirect 占位)+ `supabase_app_access` client role。
- `scripts/seed/business-apps.ts`:幂等登记 Supabase 到 applications(code=supabase、keycloakClientId=supabase-business-app、accessClientRole=supabase_app_access、webhookUrl 占位、webhookSecretRef=SUPABASE_WEBHOOK_SECRET)。并入 seed-portal-db。

### T2 业务侧接入 SDK 参考实现(lib 外的独立样例,纳入测试)
- `lib/business-app-kit/`(供接入方复制的参考,平台侧不依赖):`verify-access.ts`(校验 JWT 的 resource_access[clientId].roles 含 access role → 允许,否则 403 APP_ACCESS_DENIED)、`verify-webhook.ts`(复用 webhook-signature verify)。
- 单测:token 含/不含角色的放行/拒绝;webhook 验签通过/时间窗/篡改。

### T3 端到端联调集成测试
- `tests/integration/e2e-onboarding.test.ts`(真实 PG/KC/RabbitMQ + 参考 verifier + 本地 webhook 端点):
  注册 submit → approve(建 KC 用户+镜像)→ 授予 supabase 准入(投影 KC client role)→ 分配应用角色 → dispatch outbox → webhook 投递到本地端点(验签通过)→ 参考 verifier 用该用户 token 校验准入通过 → 撤销准入 → verifier 校验拒绝 → reconcile 无差异。

### T4 存量用户迁移工具
- `scripts/migrate-legacy-users.ts`:输入 CSV/JSON(id,email,phone,username,external_id),按优先级匹配 KC 现有用户 → 建映射(portal_users + legacy_user_identity 记录到 metadata),输出报告(matched/created/manual)。幂等。
- 集成测试:样例数据集匹配断言。

### T5 通用接入文档 + 验收清单
- `docs/guides/business-app-onboarding.md`:十步流程、token 校验契约(401/403 码)、Webhook 消费(签名/幂等/重试语义)、keycloak_sub 映射、回滚(dual_login 状态机)、验收清单 10 项、交付物清单。

### T6 收尾
- lint/typecheck/unit/integration 全绿;进度表 L6;commit + push。

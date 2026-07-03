# tiangong-lca 应用登记与角色目录 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把平台的"首个业务应用"登记从占位命名 `supabase` 更正为真实应用 `tiangong-lca`,登记其三个应用角色,并为 `application.role.*` 事件补齐 `applicationCode` 字段。

**Architecture:** 纯平台侧改动:bootstrap(Keycloak client)、seed(applications + application_roles)、事件 payload、引用清扫。不新增页面;不改 API 面。

**Tech Stack:** Next.js App Router、Drizzle ORM、@keycloak/keycloak-admin-client、Vitest(unit + integration 对真实容器)。

**Tracking:** Issue [tiangong-lca/identity-center#3](https://github.com/tiangong-lca/identity-center/issues/3);设计依据 carbon-workspace `_docs/plans/2026-07-03-lca-platform-identity-center-integration-design.md` §4.5/§5。

## Global Constraints

- 分支自 `origin/main` 创建:`feat/tiangong-lca-app-registration`;PR 回 `main`,正文含 `Closes #3`。
- 命名契约(设计 §5,逐字):应用 code=`tiangong-lca`;Keycloak Client ID=`tiangong-lca-business-app`;准入 Client Role=`tiangong_lca_access`;env=`TIANGONG_LCA_APP_ORIGIN`、`TIANGONG_LCA_GOTRUE_CALLBACK`、`TIANGONG_LCA_WEBHOOK_URL`、`TIANGONG_LCA_WEBHOOK_SECRET`、`TIANGONG_LCA_LOGIN_URL`。
- 应用角色(设计 §4.5,逐字):`admin`(系统管理员)、`review-admin`(评审管理员)、`review-member`(评审成员);互斥单角色为管理约定,平台不加库级约束。
- 本仓工作方式(GOAL.md §5):关键集成实现前先查证当前文档(Context7/官方),结论记 `docs/references/`;UI 文案一律 i18n 资源化;测试对真实容器。
- 包管理器 pnpm;测试命令:`pnpm test`(unit)、`pnpm test:integration`(需 `deploy/docker/docker-compose.dev.yml` 全服务运行)。
- OAuth 客户端语义:与 GoTrue 联邦时,真正的 RP 是 GoTrue,Valid Redirect URI 必须指向 GoTrue 回调(`<SUPABASE_URL>/auth/v1/callback`),不是应用 origin。

---

### Task 1: bootstrap 更名 tiangong-lca client 并修正 redirect 语义

**Files:**
- Modify: `identity-portal/scripts/bootstrap-keycloak-realm.ts:111-132`
- Reference: `identity-portal/scripts/print-client-secret.ts`(取 client secret 供 GoTrue 配置)

**Interfaces:**
- Produces: Keycloak client `tiangong-lca-business-app`(confidential、Standard Flow)+ client role `tiangong_lca_access`;bootstrap 幂等(`ensureClient` 存在即 update)。

- [ ] **Step 1: 查证 GoTrue 上游 PKCE 行为**

用 Context7 查 supabase 文档(`/websites/supabase`)与 GoTrue 仓库说明:GoTrue 作为 confidential client 对上游 IdP(Keycloak provider)是否发送 `code_challenge`。已知结论(设计 §5):GoTrue 走 client_secret,不发 PKCE → Keycloak client 强制 `pkce.code.challenge.method: S256` 会拒绝其授权码交换,应移除该属性。若查证推翻此结论则保留属性并跳过 Step 2 中的删除。查证结论(含引用链接)写入 `docs/references/2026-07-03-gotrue-keycloak-federation.md`。

- [ ] **Step 2: 修改 bootstrap 脚本**

将 `scripts/bootstrap-keycloak-realm.ts` 111-132 行整段替换为:

```typescript
  // 首个业务应用:TianGong LCA(Supabase self-host 形态;OAuth RP 是 GoTrue,redirect 指向 GoTrue 回调)
  const lcaGotrueCallback =
    process.env.TIANGONG_LCA_GOTRUE_CALLBACK ?? 'http://localhost:54321/auth/v1/callback'
  const lcaAppOrigin = process.env.TIANGONG_LCA_APP_ORIGIN ?? 'http://localhost:8000'
  const lcaClient = await ensureClient(kc, {
    clientId: 'tiangong-lca-business-app',
    name: 'TianGong LCA Platform',
    description: '首个接入的业务应用(TianGong LCA,Supabase self-host)',
    publicClient: false,
    standardFlowEnabled: true,
    implicitFlowEnabled: false,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false,
    redirectUris: [lcaGotrueCallback],
    webOrigins: [lcaAppOrigin],
    // GoTrue 对上游 IdP 不发 code_challenge(见 docs/references/2026-07-03-gotrue-keycloak-federation.md),
    // 不设 pkce.code.challenge.method;凭 client secret 保障
    attributes: {},
  })
  // 准入投影角色 tiangong_lca_access
  const existingLcaRole = await kc.clients
    .findRole({ id: lcaClient.id, roleName: 'tiangong_lca_access' })
    .catch(() => null)
  if (!existingLcaRole) {
    await kc.clients.createRole({ id: lcaClient.id, name: 'tiangong_lca_access' })
  }
```

同文件内如有对旧变量名(`supabaseOrigin`/`supabaseClient`/`existingRole`)的后续引用,一并更名。

- [ ] **Step 3: 处理存量 realm 中的旧 client**

在上面代码块之后追加幂等清理(已有部署重跑 bootstrap 时移除占位 client):

```typescript
  const legacySupabaseClient = (await kc.clients.find({ clientId: 'supabase-business-app' }))[0]
  if (legacySupabaseClient?.id) {
    await kc.clients.del({ id: legacySupabaseClient.id })
    console.log('legacy client supabase-business-app 已移除')
  }
```

- [ ] **Step 4: 重建 realm 验证幂等**

```bash
cd identity-portal
docker compose -f deploy/docker/docker-compose.dev.yml up -d
pnpm bootstrap:keycloak   # 若脚本名不同,以 package.json 中 bootstrap 脚本为准
pnpm bootstrap:keycloak   # 第二遍验证幂等
```

Expected: 两遍均成功;日志出现 `client tiangong-lca-business-app 已创建/已更新`;Keycloak 管理台(http://localhost:8080)该 client 的 Valid Redirect URIs = `http://localhost:54321/auth/v1/callback`,Client roles 含 `tiangong_lca_access`,`supabase-business-app` 不存在。

- [ ] **Step 5: 更新 realm 导出 JSON**

按 L0 既有导出机制(检查 `scripts/` 与 `deploy/keycloak/realm-company-dev.json` 的生成方式)重新导出 realm 并覆盖 `deploy/keycloak/realm-company-dev.json`;diff 应只含 client 更名相关变化。

- [ ] **Step 6: Commit**

```bash
git add identity-portal/scripts/bootstrap-keycloak-realm.ts identity-portal/deploy/keycloak/ docs/references/2026-07-03-gotrue-keycloak-federation.md
git commit -m "feat(bootstrap): register tiangong-lca-business-app client, drop supabase placeholder"
```

---

### Task 2: seed 更名 + application_roles 角色目录(D6)

**Files:**
- Modify: `identity-portal/scripts/seed/business-apps.ts`(整文件重写)
- Modify: `identity-portal/scripts/seed-portal-db.ts`(仅 console 文案)
- Test: `identity-portal/tests/integration/seed-business-apps.test.ts`(新建)

**Interfaces:**
- Consumes: `schema.applications`、`schema.applicationRoles`(唯一键 `(applicationId, code)`)。
- Produces: `seedBusinessApps(db)` 幂等产出 code=`tiangong-lca` 的 applications 行 + 3 行 application_roles;存量 code=`supabase` 行被原位更名(保留 id/关联)。

- [ ] **Step 1: 写失败测试**

`tests/integration/seed-business-apps.test.ts`:

```typescript
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { seedBusinessApps } from '@/scripts/seed/business-apps'
import { getDbTargets } from './helpers/db-targets'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

describe('seedBusinessApps(tiangong-lca)', () => {
  let tdb: TestDb
  beforeAll(async () => {
    const [pg] = getDbTargets()
    tdb = await createMigratedTestDb(pg.adminUrl)
  })
  afterAll(async () => (tdb ? tdb.destroy() : undefined))

  it('幂等登记 tiangong-lca 应用与 3 个角色', async () => {
    await seedBusinessApps(tdb.db)
    await seedBusinessApps(tdb.db)
    const apps = await tdb.db.query.applications.findMany()
    expect(apps).toHaveLength(1)
    expect(apps[0]).toMatchObject({
      code: 'tiangong-lca',
      keycloakClientId: 'tiangong-lca-business-app',
      accessClientRole: 'tiangong_lca_access',
      webhookSecretRef: 'TIANGONG_LCA_WEBHOOK_SECRET',
    })
    const roles = await tdb.db.query.applicationRoles.findMany({
      where: eq(schema.applicationRoles.applicationId, apps[0].id),
    })
    expect(roles.map((r) => r.code).sort()).toEqual(['admin', 'review-admin', 'review-member'])
  })

  it('存量 supabase 占位行被原位更名(保留 id)', async () => {
    const [pg] = getDbTargets()
    const tdb2 = await createMigratedTestDb(pg.adminUrl)
    const [legacy] = await tdb2.db
      .insert(schema.applications)
      .values({
        code: 'supabase',
        name: 'Supabase 业务应用',
        keycloakClientId: 'supabase-business-app',
        accessClientRole: 'supabase_app_access',
        status: 'active',
        webhookSecretRef: 'SUPABASE_WEBHOOK_SECRET',
      })
      .returning()
    await seedBusinessApps(tdb2.db)
    const apps = await tdb2.db.query.applications.findMany()
    expect(apps).toHaveLength(1)
    expect(apps[0].id).toBe(legacy.id)
    expect(apps[0].code).toBe('tiangong-lca')
    await tdb2.destroy()
  })
})
```

注:`getDbTargets` 的实际导出形态以 `tests/integration/helpers/db-targets.ts` 为准,对齐现有集成测试(例:`api-contract.test.ts`)的用法。

- [ ] **Step 2: 跑测试确认失败**

```bash
cd identity-portal && pnpm test:integration -- seed-business-apps
```

Expected: FAIL(仍 seed 出 code=supabase)。

- [ ] **Step 3: 重写 seed 模块**

`scripts/seed/business-apps.ts` 全量替换:

```typescript
import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/db/schema'

type Db = NodePgDatabase<typeof schema>

const APP = {
  code: 'tiangong-lca',
  name: 'TianGong LCA 平台',
  keycloakClientId: 'tiangong-lca-business-app',
  accessClientRole: 'tiangong_lca_access',
  status: 'active' as const,
}

/** 应用级角色目录(设计 §4.5:互斥单角色管理约定;member 为应用默认标准身份不登记) */
const APP_ROLES: Array<{ code: string; name: string; description: string }> = [
  { code: 'admin', name: '系统管理员', description: 'TianGong LCA 系统管理员' },
  { code: 'review-admin', name: '评审管理员', description: '评审流程管理员' },
  { code: 'review-member', name: '评审成员', description: '评审成员' },
]

/** 首个业务应用登记(幂等):TianGong LCA;存量 supabase 占位行原位更名 */
export async function seedBusinessApps(db: Db) {
  let app = await db.query.applications.findFirst({
    where: eq(schema.applications.code, APP.code),
  })
  if (!app) {
    const legacy = await db.query.applications.findFirst({
      where: eq(schema.applications.code, 'supabase'),
    })
    if (legacy) {
      ;[app] = await db
        .update(schema.applications)
        .set({
          ...APP,
          webhookUrl: process.env.TIANGONG_LCA_WEBHOOK_URL ?? legacy.webhookUrl,
          webhookSecretRef: 'TIANGONG_LCA_WEBHOOK_SECRET',
          loginUrl: process.env.TIANGONG_LCA_LOGIN_URL ?? legacy.loginUrl,
          metadata: { onboarding: 'phase-1', kind: 'supabase-self-host' },
          updatedAt: new Date(),
        })
        .where(eq(schema.applications.id, legacy.id))
        .returning()
    } else {
      ;[app] = await db
        .insert(schema.applications)
        .values({
          ...APP,
          webhookUrl: process.env.TIANGONG_LCA_WEBHOOK_URL ?? null,
          webhookSecretRef: 'TIANGONG_LCA_WEBHOOK_SECRET',
          loginUrl: process.env.TIANGONG_LCA_LOGIN_URL ?? null,
          metadata: { onboarding: 'phase-1', kind: 'supabase-self-host' },
        })
        .returning()
    }
  }

  const existing = await db.query.applicationRoles.findMany({
    where: eq(schema.applicationRoles.applicationId, app.id),
  })
  const missing = APP_ROLES.filter((role) => !existing.some((r) => r.code === role.code))
  if (missing.length > 0) {
    await db.insert(schema.applicationRoles).values(
      missing.map((role) => ({
        applicationId: app.id,
        code: role.code,
        name: role.name,
        description: role.description,
        status: 'active',
      })),
    )
  }
}
```

`scripts/seed-portal-db.ts` 中 `console.log('业务应用目录就绪(Supabase)')` 改为 `console.log('业务应用目录就绪(tiangong-lca + 3 角色)')`。

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm test:integration -- seed-business-apps
```

Expected: PASS(2 tests)。

- [ ] **Step 5: Commit**

```bash
git add identity-portal/scripts/seed/business-apps.ts identity-portal/scripts/seed-portal-db.ts identity-portal/tests/integration/seed-business-apps.test.ts
git commit -m "feat(seed): register tiangong-lca app and role catalog, rename legacy supabase row"
```

---

### Task 3: application.role.* 事件 payload 补 applicationCode

**Files:**
- Modify: `identity-portal/server/services/app-role-assignment-service.ts`
- Test: `identity-portal/tests/integration/app-role-events.test.ts`(新建;若已有覆盖 role 分配的集成测试,扩展断言即可)

**Interfaces:**
- Produces: `application.role.assigned` / `application.role.revoked` outbox payload 增加 `applicationCode: string`(与 `access.*` 事件对齐;消费端按此过滤)。

- [ ] **Step 1: 写失败测试**

`tests/integration/app-role-events.test.ts`(装配方式对齐 `api-contract.test.ts`:`createMigratedTestDb` + 真实服务;需要先造 portal_user、application、application_role、active admission——按 `e2e-onboarding.test.ts` 的既有造数手法):

```typescript
// 断言核心(节选;完整装配复用 e2e-onboarding.test.ts 的建用户/建应用段):
const assigned = await createAppRoleAssignmentService(ctx).assign({
  applicationId,
  applicationRoleId: roleId,
  portalUserId,
  source: 'admin',
})
const outbox = await tdb.db.query.outboxEvents.findMany({
  where: eq(schema.outboxEvents.eventType, 'application.role.assigned'),
})
expect(outbox).toHaveLength(1)
expect(outbox[0].payload).toMatchObject({
  eventType: 'application.role.assigned',
  keycloakSub: expect.any(String),
  applicationCode: 'tiangong-lca',
  roleCode: 'review-admin',
  scopeType: 'global',
})

await createAppRoleAssignmentService(ctx).revoke(assigned.id)
const revoked = await tdb.db.query.outboxEvents.findMany({
  where: eq(schema.outboxEvents.eventType, 'application.role.revoked'),
})
expect(revoked[0].payload).toMatchObject({ applicationCode: 'tiangong-lca' })
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm test:integration -- app-role-events
```

Expected: FAIL(payload 无 applicationCode)。

- [ ] **Step 3: 实现**

`app-role-assignment-service.ts` 的 `assign()`:role 查询之后加载 app(role 已校验属于该 application):

```typescript
      const app = await ctx.db.query.applications.findFirst({
        where: eq(schema.applications.id, input.applicationId),
      })
      if (!app) throw new ApiError('APPLICATION_NOT_FOUND', '应用不存在')
```

`ROLE_ASSIGNED` payload 增加一行 `applicationCode: app.code,`。

`revoke()`:role 查询旁增加:

```typescript
      const app = await ctx.db.query.applications.findFirst({
        where: eq(schema.applications.id, existing.applicationId),
      })
```

`ROLE_REVOKED` payload 增加 `applicationCode: app?.code ?? null,`。

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm test:integration -- app-role-events
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add identity-portal/server/services/app-role-assignment-service.ts identity-portal/tests/integration/app-role-events.test.ts
git commit -m "feat(events): include applicationCode in application.role.* payloads"
```

---

### Task 4: 全仓引用清扫(supabase → tiangong-lca)

**Files:**
- Modify: `identity-portal/tests/integration/e2e-onboarding.test.ts`
- Modify: `identity-portal/tests/unit/business-app-kit.test.ts`(如引用具体命名)
- Modify: `identity-portal/messages/en/apps.json`、`identity-portal/messages/zh-CN/apps.json`(如含 Supabase 示例文案)
- Modify: `docs/guides/business-app-onboarding.md`(“首个接入应用为 Supabase” → TianGong LCA;示例命名同步)
- Modify: `docs/implementation/decisions.md`(追加 D-004 记录本次更名与 PKCE 结论)
- Modify: 其余 `rg -i supabase` 命中处(env 样例、部署文档),`deploy/keycloak/realm-company-dev.json` 已在 Task 1 处理

- [ ] **Step 1: 枚举命中**

```bash
cd identity-portal && rg -in 'supabase' --glob '!node_modules' --glob '!pnpm-lock.yaml' ..
```

- [ ] **Step 2: 逐处更名**

e2e-onboarding.test.ts:`getByCode('supabase')`→`'tiangong-lca'`;`supabase-business-app`→`tiangong-lca-business-app`;`supabase_app_access`→`tiangong_lca_access`;`SUPABASE_WEBHOOK_SECRET`→`TIANGONG_LCA_WEBHOOK_SECRET`;describe/注释同步。`business-app-kit` 参考实现本身保持应用无关,测试 fixture 命名可保留通用值。文档与 i18n 文案按语义更新;`decisions.md` 追加:

```markdown
## D-004 首个业务应用登记更名为 tiangong-lca(2026-07-03,workspace 决策 D4)

Supabase 占位登记(code=supabase)更名为真实应用 tiangong-lca(client=tiangong-lca-business-app,role=tiangong_lca_access,env=TIANGONG_LCA_*)。
Redirect URI 语义修正:RP 是 GoTrue,指向 <SUPABASE_URL>/auth/v1/callback。PKCE 属性处理结论见 docs/references/2026-07-03-gotrue-keycloak-federation.md。
角色目录(admin/review-admin/review-member)随 seed 登记,互斥单角色为管理约定。role 事件 payload 补 applicationCode。
依据:carbon-workspace/_docs/plans/2026-07-03-lca-platform-identity-center-integration-design.md。
```

- [ ] **Step 3: 全量验证**

```bash
pnpm lint && pnpm test && pnpm test:integration
rg -in 'supabase' --glob '!node_modules' --glob '!pnpm-lock.yaml' .. | rg -v 'self-host|Supabase self-host|business-app-kit|references/'
```

Expected: 三个测试命令全绿;残余命中只剩语义上确应保留的(如"Supabase self-host 形态"描述)。

- [ ] **Step 4: Commit + push + PR**

```bash
git add -A && git commit -m "chore: sweep supabase placeholder naming to tiangong-lca"
git push -u origin feat/tiangong-lca-app-registration
gh pr create --title "feat: register tiangong-lca business app (rename supabase placeholder)" --body "<按 workspace issue-pr-workflow.md 模板:Summary/Linked Issue(Closes #3)/Change Facts/Validation(贴命令输出)/Risk-Rollback/Workspace Integration(Pending)>"
```

# 注册申请选择应用与角色(D7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 注册申请可携带"申请的应用与角色"(多应用、每应用至多一角色、角色可空),审批通过后自动授予所选准入与角色。

**Architecture:** `registration_requests` 增 `requested_access` jsonb 快照列;新公共目录端点供注册页选择;审批编排在开通后依序调用既有 `assignment-service.grant` 与 `app-role-assignment-service.assign`(source=`registration`),事件/投影/审计走既有管道;授予失败不回滚开通。

**Tech Stack:** Next.js App Router、Drizzle(drizzle-kit migration)、Zod、next-intl、Vitest。

**Tracking:** Issue [tiangong-lca/identity-center#4](https://github.com/tiangong-lca/identity-center/issues/4);设计依据 carbon-workspace `_docs/plans/2026-07-03-lca-platform-identity-center-integration-design.md` §4.6。

## Global Constraints

- 分支自 `origin/main`:`feat/registration-app-role-selection`;PR 回 `main`,`Closes #4`。建议基于 `feat/tiangong-lca-app-registration` 合并后的 main(联调用得上 tiangong-lca 角色目录;功能本身不依赖)。
- 校验规则(设计 §4.6,逐字):应用存在且 active;`applicationCode` 去重;roleCode(可选)必须属于该应用且 active;每应用至多一个角色;数组长度 ≤20。
- `requested_access` 是申请快照(软引用,同 `requestedOrganizationId` 模式),不设 FK。
- 全部新 UI 文案进 `messages/{zh-CN,en}/*.json`;错误响应用既有错误码(`VALIDATION_ERROR` 等);公共端点必须限流。
- 授予失败不回滚开通;逐项结果返回给审批响应(语义:平台"事实成立、投影最终一致")。
- pnpm;`pnpm test` / `pnpm test:integration`(真实容器)。

---

### Task 1: schema 列 + migration + 共享类型

**Files:**
- Modify: `identity-portal/db/schema/users.ts`(registrationRequests 表)
- Create: `identity-portal/lib/registration/requested-access.ts`
- Create: `identity-portal/db/migrations/0002_registration_requested_access.sql`(drizzle-kit 生成)
- Test: `identity-portal/tests/unit/requested-access.test.ts`

**Interfaces:**
- Produces: 列 `requestedAccess: jsonb('requested_access')`;类型 `RequestedAccessEntry = { applicationCode: string; roleCode?: string }`;Zod schema `requestedAccessSchema`(形状校验:非空 code、去重、≤20;DB 存在性校验在 Task 3)。

- [ ] **Step 1: 写失败单测**

`tests/unit/requested-access.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { requestedAccessSchema } from '@/lib/registration/requested-access'

describe('requestedAccessSchema', () => {
  it('接受多应用且每应用可选单角色', () => {
    const r = requestedAccessSchema.safeParse([
      { applicationCode: 'tiangong-lca', roleCode: 'review-admin' },
      { applicationCode: 'another-app' },
    ])
    expect(r.success).toBe(true)
  })
  it.each([
    [[{ applicationCode: 'a' }, { applicationCode: 'a' }], '重复应用'],
    [[{ applicationCode: '' }], '空 code'],
    [Array.from({ length: 21 }, (_, i) => ({ applicationCode: `app-${i}` })), '超长'],
  ])('拒绝非法输入: %#', (input) => {
    expect(requestedAccessSchema.safeParse(input).success).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd identity-portal && pnpm test -- requested-access
```

Expected: FAIL(模块不存在)。

- [ ] **Step 3: 实现类型与 schema 列**

`lib/registration/requested-access.ts`:

```typescript
import { z } from 'zod'

/** 注册申请的应用/角色选择(设计 §4.6):多应用、每应用至多一角色、角色可空 */
export const requestedAccessEntrySchema = z.object({
  applicationCode: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  roleCode: z.string().min(1).max(64).optional(),
})

export const requestedAccessSchema = z
  .array(requestedAccessEntrySchema)
  .max(20)
  .refine(
    (entries) => new Set(entries.map((e) => e.applicationCode)).size === entries.length,
    { message: '申请的应用重复' },
  )

export type RequestedAccessEntry = z.infer<typeof requestedAccessEntrySchema>
```

`db/schema/users.ts` registrationRequests 在 `requestedReason` 之后加:

```typescript
    /** 申请的应用与角色快照(设计 §4.6):[{ applicationCode, roleCode? }],软引用不设 FK */
    requestedAccess: jsonb('requested_access'),
```

(文件顶部 import 增加 `jsonb`,与 `db/schema/applications.ts` 的用法一致。)

- [ ] **Step 4: 生成 migration 并验证**

```bash
pnpm db:generate
pnpm test -- requested-access
```

Expected: `db/migrations/` 新增一个只含 `ALTER TABLE "registration_requests" ADD COLUMN "requested_access" jsonb;` 的迁移(生成文件名以 drizzle-kit 输出为准,若为随机 slug 可用 `--name registration_requested_access`);单测 PASS。随后跑一个依赖 `createMigratedTestDb` 的既有集成测试(如 `pnpm test:integration -- seed-business-apps`)验证从零迁移可执行。

- [ ] **Step 5: Commit**

```bash
git add identity-portal/db identity-portal/lib/registration identity-portal/tests/unit/requested-access.test.ts
git commit -m "feat(db): add registration_requests.requested_access snapshot column"
```

---

### Task 2: 公共目录端点 GET /api/public/applications

**Files:**
- Create: `identity-portal/app/api/public/applications/route.ts`
- Modify: 限流规则表(`rg -n 'RATE_LIMIT_RULES' identity-portal/lib identity-portal/app` 定位;在规则对象中新增 scene `catalog`,形态照抄相邻 scene,取 30 次/分钟/IP)
- Test: `identity-portal/tests/integration/public-applications.test.ts`

**Interfaces:**
- Produces: `GET /api/public/applications` → `{ data: { items: [{ code, name, roles: [{ code, name }] }] }, requestId }`;仅 active 应用与 active 角色;无鉴权,scene=`catalog` 限流。

- [ ] **Step 1: 写失败契约测试**

`tests/integration/public-applications.test.ts`(装配对齐 `api-contract.test.ts`;直接 import route handler 用 `NextRequest` 调用):

```typescript
import { NextRequest } from 'next/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { GET } from '@/app/api/public/applications/route'
import { seedBusinessApps } from '@/scripts/seed/business-apps'
import { __setServiceContextForTests, type ServiceContext } from '@/server/services/context'
import { getDbTargets } from './helpers/db-targets'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

describe('GET /api/public/applications', () => {
  let tdb: TestDb
  beforeAll(async () => {
    const [pg] = getDbTargets()
    tdb = await createMigratedTestDb(pg.adminUrl)
    __setServiceContextForTests({ db: tdb.db, keycloak: null as never })
    await seedBusinessApps(tdb.db)
  })
  afterAll(async () => {
    __setServiceContextForTests(null)
    await tdb?.destroy()
  })

  it('返回 active 应用及其 active 角色的 code/name', async () => {
    const res = await GET(new NextRequest('http://test.local/api/public/applications'))
    expect(res.status).toBe(200)
    const body = await res.json()
    const app = body.data.items.find((a: { code: string }) => a.code === 'tiangong-lca')
    expect(app).toBeTruthy()
    expect(app.roles.map((r: { code: string }) => r.code).sort()).toEqual([
      'admin', 'review-admin', 'review-member',
    ])
    expect(app.keycloakClientId).toBeUndefined() // 不泄露超出 code/name 的字段
  })
})
```

(若 publicRoute 强制 Redis 限流导致测试环境依赖:compose dev 已含 Redis;对齐既有公共端点契约测试的处理方式。)

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm test:integration -- public-applications
```

Expected: FAIL(route 不存在)。

- [ ] **Step 3: 实现 route + 限流 scene**

`app/api/public/applications/route.ts`:

```typescript
import { and, eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { ok, publicRoute } from '@/app/api/_helpers'

/** 注册页应用/角色选择目录(D7):仅 active;仅暴露 code/name(公开可枚举性已评审接受) */
export const GET = publicRoute({ scene: 'catalog' }, async (_request, { requestId, ctx }) => {
  const apps = await ctx.db.query.applications.findMany({
    where: eq(schema.applications.status, 'active'),
  })
  const items = await Promise.all(
    apps.map(async (app) => {
      const roles = await ctx.db.query.applicationRoles.findMany({
        where: and(
          eq(schema.applicationRoles.applicationId, app.id),
          eq(schema.applicationRoles.status, 'active'),
        ),
      })
      return {
        code: app.code,
        name: app.name,
        roles: roles.map((r) => ({ code: r.code, name: r.name })),
      }
    }),
  )
  return ok({ items }, requestId)
})
```

限流规则表新增(照抄相邻 scene 的数值结构):`catalog: { limit: 30, windowSeconds: 60 }`(字段名以现有规则为准)。

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm test:integration -- public-applications
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add identity-portal/app/api/public/applications identity-portal/tests/integration/public-applications.test.ts
git add $(rg -l 'RATE_LIMIT_RULES' identity-portal/lib identity-portal/app | head -5)
git commit -m "feat(api): public application/role catalog for registration (D7)"
```

---

### Task 3: 提交入口接收并校验 requestedAccess

**Files:**
- Modify: `identity-portal/app/api/public/registration-requests/route.ts`
- Modify: `identity-portal/server/services/registration-service.ts`(submit + 新增 DB 校验)
- Test: `identity-portal/tests/integration/registration-requested-access.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `requestedAccessSchema`、`RequestedAccessEntry`。
- Produces: `registration-service` 导出 `validateRequestedAccess(db, entries): Promise<void>`(违规抛 `ApiError('VALIDATION_ERROR', …)`);`submit()` 入参与落库均含 `requestedAccess`。

- [ ] **Step 1: 写失败测试**

`tests/integration/registration-requested-access.test.ts`(装配同前;seedBusinessApps 先行):

```typescript
it('合法选择随申请落库', async () => {
  const svc = createRegistrationService(ctx)
  const row = await svc.submit({
    email: 'u1@test.local',
    requestedAccess: [{ applicationCode: 'tiangong-lca', roleCode: 'review-admin' }],
  })
  expect(row.requestedAccess).toEqual([
    { applicationCode: 'tiangong-lca', roleCode: 'review-admin' },
  ])
})

it.each([
  [[{ applicationCode: 'no-such-app' }], /应用/],
  [[{ applicationCode: 'tiangong-lca', roleCode: 'no-such-role' }], /角色/],
])('非法选择被拒: %#', async (requestedAccess, msg) => {
  const svc = createRegistrationService(ctx)
  await expect(
    svc.submit({ email: `bad-${Math.random()}@test.local`, requestedAccess }),
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', message: expect.stringMatching(msg) })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm test:integration -- registration-requested-access
```

Expected: FAIL(submit 不接受该字段)。

- [ ] **Step 3: 实现**

`registration-service.ts` 顶部 import `requestedAccessSchema`/`RequestedAccessEntry` 与 `and`;新增导出:

```typescript
/** D7:requested_access 的 DB 存在性校验(形状校验由 zod 完成) */
export async function validateRequestedAccess(
  db: ServiceContext['db'],
  entries: RequestedAccessEntry[],
): Promise<void> {
  for (const entry of entries) {
    const app = await db.query.applications.findFirst({
      where: and(
        eq(schema.applications.code, entry.applicationCode),
        eq(schema.applications.status, 'active'),
      ),
    })
    if (!app) throw new ApiError('VALIDATION_ERROR', `应用不存在或未启用: ${entry.applicationCode}`)
    if (entry.roleCode) {
      const roles = await db.query.applicationRoles.findMany({
        where: and(
          eq(schema.applicationRoles.applicationId, app.id),
          eq(schema.applicationRoles.status, 'active'),
        ),
      })
      if (!roles.some((r) => r.code === entry.roleCode)) {
        throw new ApiError('VALIDATION_ERROR', `角色不属于该应用: ${entry.applicationCode}/${entry.roleCode}`)
      }
    }
  }
}
```

`submit()` 签名扩展 `requestedAccess?: RequestedAccessEntry[]`,在插入前:

```typescript
      const requestedAccess = input.requestedAccess?.length
        ? requestedAccessSchema.parse(input.requestedAccess)
        : undefined
      if (requestedAccess) await validateRequestedAccess(ctx.db, requestedAccess)
```

插入 values 增加 `requestedAccess: requestedAccess ?? null,`(pending 幂等返回分支保持不变)。

`app/api/public/registration-requests/route.ts` 的 zod schema 增加:

```typescript
  requestedAccess: requestedAccessSchema.optional(),
```

(import 自 `@/lib/registration/requested-access`;zod parse 失败由既有 `parseBody` 转 400 `VALIDATION_ERROR`。)

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm test:integration -- registration-requested-access
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add identity-portal/server/services/registration-service.ts identity-portal/app/api/public/registration-requests/route.ts identity-portal/tests/integration/registration-requested-access.test.ts
git commit -m "feat(registration): accept and validate requested applications/roles (D7)"
```

---

### Task 4: 审批通过自动授予(编排)

**Files:**
- Modify: `identity-portal/server/services/registration-service.ts`(approve)
- Test: `identity-portal/tests/integration/registration-requested-access.test.ts`(追加用例)

**Interfaces:**
- Consumes: `createAssignmentService(ctx).grant(applicationId, portalUserId, source)`;`createAppRoleAssignmentService(ctx).assign({ applicationId, applicationRoleId, portalUserId, scopeType:'global', source })`。
- Produces: `approve()` 返回值增加 `grants: Array<{ applicationCode: string; admission: 'granted' | 'skipped' | 'failed'; role?: 'assigned' | 'failed'; error?: string }>`。

- [ ] **Step 1: 追加失败测试**

```typescript
it('审批通过后自动授予所选准入与角色(source=registration)', async () => {
  const svc = createRegistrationService(ctx)
  const req = await svc.submit({
    email: 'grantee@test.local',
    requestedAccess: [{ applicationCode: 'tiangong-lca', roleCode: 'review-admin' }],
  })
  const { portalUser, grants } = await svc.approve(req.id, {})
  expect(grants).toEqual([
    { applicationCode: 'tiangong-lca', admission: 'granted', role: 'assigned' },
  ])
  const assignment = await tdb.db.query.applicationAssignments.findFirst({
    where: eq(schema.applicationAssignments.portalUserId, portalUser.id),
  })
  expect(assignment).toMatchObject({ status: 'active', source: 'registration' })
  const roleRows = await tdb.db.query.applicationUserRoles.findMany({
    where: eq(schema.applicationUserRoles.portalUserId, portalUser.id),
  })
  expect(roleRows).toHaveLength(1)
  expect(roleRows[0]).toMatchObject({ status: 'active', source: 'registration' })
  const events = await tdb.db.query.outboxEvents.findMany()
  const types = events.map((e) => e.eventType)
  expect(types).toEqual(
    expect.arrayContaining([
      'identity.user.created', 'access.application.granted', 'application.role.assigned',
    ]),
  )
})

it('审批时应用已失效 → 该项 failed 但开通成功', async () => {
  const svc = createRegistrationService(ctx)
  const req = await svc.submit({
    email: 'partial@test.local',
    requestedAccess: [{ applicationCode: 'tiangong-lca' }],
  })
  await tdb.db.update(schema.applications).set({ status: 'disabled' })
    .where(eq(schema.applications.code, 'tiangong-lca'))
  const { grants } = await svc.approve(req.id, {})
  expect(grants[0]).toMatchObject({ applicationCode: 'tiangong-lca', admission: 'failed' })
  await tdb.db.update(schema.applications).set({ status: 'active' })
    .where(eq(schema.applications.code, 'tiangong-lca'))
})
```

(此用例走真实 Keycloak:approve 会创建 KC 用户,记得按 `api-contract.test.ts` 的 afterAll 清理模式收集并删除 KC 用户。grant 的 KC 投影失败不影响 `admission:'granted'` 语义——事实已成立,投影状态由既有字段表达。)

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm test:integration -- registration-requested-access
```

Expected: FAIL(approve 无 grants)。

- [ ] **Step 3: 实现编排**

`registration-service.ts` 顶部:

```typescript
import { createAssignmentService } from './assignment-service'
import { createAppRoleAssignmentService } from './app-role-assignment-service'
```

`approve()` 在既有事务与 audit 之间插入(事务外,逐项独立):

```typescript
      type GrantOutcome = {
        applicationCode: string
        admission: 'granted' | 'skipped' | 'failed'
        role?: 'assigned' | 'failed'
        error?: string
      }
      const grants: GrantOutcome[] = []
      const requested = (request.requestedAccess ?? []) as RequestedAccessEntry[]
      if (requested.length > 0) {
        const assignments = createAssignmentService(ctx)
        const roleAssignments = createAppRoleAssignmentService(ctx)
        for (const entry of requested) {
          const outcome: GrantOutcome = { applicationCode: entry.applicationCode, admission: 'granted' }
          try {
            const app = await ctx.db.query.applications.findFirst({
              where: and(
                eq(schema.applications.code, entry.applicationCode),
                eq(schema.applications.status, 'active'),
              ),
            })
            if (!app) throw new ApiError('APPLICATION_NOT_FOUND', '应用不存在或未启用')
            try {
              await assignments.grant(app.id, result.portalUser.id, 'registration')
            } catch (e) {
              if (isApiError(e) && e.code === 'CONFLICT') outcome.admission = 'skipped' // 已有准入
              else throw e
            }
            if (entry.roleCode) {
              const roles = await ctx.db.query.applicationRoles.findMany({
                where: eq(schema.applicationRoles.applicationId, app.id),
              })
              const role = roles.find((r) => r.code === entry.roleCode && r.status === 'active')
              if (!role) throw new ApiError('NOT_FOUND', `角色不存在: ${entry.roleCode}`)
              try {
                await roleAssignments.assign({
                  applicationId: app.id,
                  applicationRoleId: role.id,
                  portalUserId: result.portalUser.id,
                  scopeType: 'global',
                  source: 'registration',
                })
                outcome.role = 'assigned'
              } catch (e) {
                if (isApiError(e) && e.code === 'CONFLICT') outcome.role = 'assigned' // 已存在等价分配
                else throw e
              }
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            if (outcome.admission === 'granted' && !outcome.role) outcome.admission = 'failed'
            else outcome.role = 'failed'
            outcome.error = msg
          }
          grants.push(outcome)
        }
      }
```

(import `isApiError` 自 `@/lib/http/api-error`;返回值改为 `return { ...result, grants }`;audit `afterData` 增加 `grants` 摘要。注意错误归因:准入失败与角色失败分别标注——实现时按 try 块位置拆分而非合并 catch,以测试为准。)

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm test:integration -- registration-requested-access
```

Expected: PASS(3 用例)。

- [ ] **Step 5: Commit**

```bash
git add identity-portal/server/services/registration-service.ts identity-portal/tests/integration/registration-requested-access.test.ts
git commit -m "feat(registration): auto-grant requested access/roles on approval (D7)"
```

---

### Task 5: 注册页表单 + 审批详情展示 + i18n

**Files:**
- Modify: `identity-portal/features/registrations/register-form.tsx`
- Modify: `identity-portal/features/registrations/review-dialog.tsx`
- Modify: `identity-portal/messages/zh-CN/register.json`、`identity-portal/messages/en/register.json`(register-form 的 `useTranslations('register')` 命名空间所在文件,若实际是合并文件按现状放置)
- Modify: `identity-portal/messages/zh-CN/registrations.json`、`identity-portal/messages/en/registrations.json`(审批侧)
- Test: e2e 冒烟(Task 6)

**Interfaces:**
- Consumes: `GET /api/public/applications`(Task 2 响应形状)。
- Produces: 表单提交体多 `requestedAccess` 字段;审批弹窗展示申请的应用/角色。

- [ ] **Step 1: register-form 增加选择区**

在 `register-form.tsx` 中(沿用其 useState + apiFetch 风格):

```typescript
type CatalogApp = { code: string; name: string; roles: Array<{ code: string; name: string }> }

const [catalog, setCatalog] = useState<CatalogApp[]>([])
const [selection, setSelection] = useState<Record<string, string | undefined>>({}) // appCode -> roleCode|undefined;键存在=选中该应用

useEffect(() => {
  apiFetch<{ items: CatalogApp[] }>('/api/public/applications')
    .then((d) => setCatalog(d.items))
    .catch(() => setCatalog([])) // 目录失败不阻塞基本注册
}, [])
```

表单 JSX 在 reason 区块后新增(样式沿用本文件既有 shadcn/ui 组件;若仓内无 select 组件则用原生 `<select>` 加既有输入框样式类):

```tsx
{catalog.length > 0 ? (
  <div className="flex flex-col gap-1.5">
    <Label>
      {t('apps.title')}
      <span className="ml-1 font-normal text-muted-foreground">{t('apps.optional')}</span>
    </Label>
    <div className="flex flex-col gap-2">
      {catalog.map((app) => {
        const checked = app.code in selection
        return (
          <div key={app.code} className="flex flex-col gap-1 rounded-md border border-border p-2">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) =>
                  setSelection((prev) => {
                    const next = { ...prev }
                    if (e.target.checked) next[app.code] = undefined
                    else delete next[app.code]
                    return next
                  })
                }
              />
              {app.name}
            </label>
            {checked && app.roles.length > 0 ? (
              <select
                className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                aria-label={t('apps.roleLabel')}
                value={selection[app.code] ?? ''}
                onChange={(e) =>
                  setSelection((prev) => ({ ...prev, [app.code]: e.target.value || undefined }))
                }
              >
                <option value="">{t('apps.noRole')}</option>
                {app.roles.map((r) => (
                  <option key={r.code} value={r.code}>{r.name}</option>
                ))}
              </select>
            ) : null}
          </div>
        )
      })}
    </div>
  </div>
) : null}
```

提交体:

```typescript
const requestedAccess = Object.entries(selection).map(([applicationCode, roleCode]) => ({
  applicationCode,
  ...(roleCode ? { roleCode } : {}),
}))
// json: { email, displayName, requestedReason, ...(requestedAccess.length ? { requestedAccess } : {}) }
```

- [ ] **Step 2: i18n 文案**

register 命名空间(zh-CN / en)新增键:

```json
"apps": {
  "title": "申请的应用",
  "optional": "(可选)",
  "roleLabel": "角色",
  "noRole": "不指定角色(默认身份)",
  "loadFailed": "应用目录加载失败,可稍后在开通后由管理员分配"
}
```

```json
"apps": {
  "title": "Applications to request",
  "optional": "(optional)",
  "roleLabel": "Role",
  "noRole": "No specific role (default)",
  "loadFailed": "Failed to load the catalog; access can be granted by an admin after approval"
}
```

registrations 命名空间(审批侧)新增:zh `"requestedAccess": "申请的应用/角色"`、`"noRequestedAccess": "未选择"`;en `"requestedAccess": "Requested apps/roles"`、`"noRequestedAccess": "None"`。

- [ ] **Step 3: 审批弹窗展示**

`review-dialog.tsx` 详情区(displayName/reason 同级)追加:

```tsx
<div className="flex flex-col gap-1">
  <span className="text-xs text-muted-foreground">{t('dialog.requestedAccess')}</span>
  {Array.isArray(request.requestedAccess) && request.requestedAccess.length > 0 ? (
    <ul className="text-sm text-foreground">
      {(request.requestedAccess as Array<{ applicationCode: string; roleCode?: string }>).map(
        (e) => (
          <li key={e.applicationCode}>
            {e.applicationCode}
            {e.roleCode ? ` · ${e.roleCode}` : ''}
          </li>
        ),
      )}
    </ul>
  ) : (
    <span className="text-sm text-muted-foreground">{t('dialog.noRequestedAccess')}</span>
  )}
</div>
```

(键名放入 `dialog.` 子命名空间与现状一致;list 类型/字段名以 features/registrations/queries.ts 的响应类型为准并同步扩展该类型。)

- [ ] **Step 4: 手工走查 + lint**

```bash
pnpm dev
# /register:双语言、双主题下勾选 tiangong-lca + review-admin 提交成功
# 管理后台注册审批:弹窗显示所选应用/角色
pnpm lint && pnpm test
```

Expected: 走查通过;lint/test 绿(硬编码文案会被 ESLint i18n 规则拦截——必须全部资源化)。

- [ ] **Step 5: Commit**

```bash
git add identity-portal/features/registrations identity-portal/messages
git commit -m "feat(ui): registration app/role selection and approval display (D7)"
```

---

### Task 6: e2e 冒烟 + 文档 + PR

**Files:**
- Modify: 注册相关 Playwright e2e(定位:`rg -l 'register' identity-portal/tests -g '*.spec.ts'` 或 e2e 目录),追加"选择应用/角色 → 审批 → 准入与角色自动出现"断言
- Modify: `docs/references/openapi.yaml`(POST /api/public/registration-requests 增 requestedAccess;新增 GET /api/public/applications)
- Modify: `docs/guides/business-app-onboarding.md`(提及注册申请可直接选择应用/角色)
- Modify: `docs/implementation/decisions.md`(D-005:D7 实现口径,含"审批不做改派、失败不回滚")

- [ ] **Step 1: e2e 扩展并跑绿**

```bash
pnpm test:e2e -- --grep registration
```

Expected: PASS。

- [ ] **Step 2: 文档更新**

openapi.yaml 两处 fragment;decisions.md 追加 D-005(内容按设计 §4.6 四条要点摘录)。

- [ ] **Step 3: 全量验证 + PR**

```bash
pnpm lint && pnpm test && pnpm test:integration && pnpm test:e2e
git add -A && git commit -m "feat(registration): e2e + docs for app/role selection (D7)"
git push -u origin feat/registration-app-role-selection
gh pr create --title "feat(registration): applicant selects target applications and per-app role (D7)" --body "<workspace 模板:Closes #4;Validation 贴全部命令输出;Workspace Integration: Pending>"
```

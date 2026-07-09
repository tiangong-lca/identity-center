# 目录控制台 P2a(后端:API + 权限 + 禁旧端点)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为已合并的 P1 catalog-service 加上 5 个 HTTP 端点 + `catalog:read`/`catalog:apply` 权限 + `catalogJsonSchema` 导出,并禁用旧命令式 app/角色**定义**写端点(`CATALOG_MANAGED`)。**本 P2a 不含任何前端**(控制台页在 P2b)。

**Architecture:** 纯薄壳:新端点用现有 `adminRoute({permission}, handler)` 包 `createCatalogService(ctx)` 的方法,不改后端逻辑。权限走 seed 常量。旧写端点 handler 首行改为抛 `CATALOG_MANAGED`(保留 `adminRoute` 包装 → 权限仍先校验)。

**Tech Stack:** Next.js 16(App Router)、Drizzle、zod ^4.4.3(`z.toJSONSchema`)、Vitest(unit + integration 对真实 PG/KC)、pnpm。

设计依据:[`2026-07-07-catalog-console-p2-design.md`](./2026-07-07-catalog-console-p2-design.md)。

## Global Constraints

- **分支:** `feat/catalog-console`(从 origin/main `a97dddd`;spec 已提交 `a3414fd`)。M1 → PR 回 main。
- **⚠️ Next.js 16 有破坏性变更**(仓库 AGENTS.md):写 route 代码前先读 `node_modules/next/dist/docs/` 相关章节。本 P2a 的 route handler **照抄现有 `adminRoute` 范式**(已是 Next-16 正确:`params` 为 `Promise`、`NextRequest`)。
- **API 范式:** `adminRoute({ permission }, handler)`(`@/app/api/_helpers`,re-export `ok`/`fail`/`ApiError`);`parseBody(request, zodSchema)`;成功 `ok(data, requestId, status?)` → `{ data, requestId }`;错误 `{ error:{ code, message, details? }, requestId }`,状态 = `httpStatusOf(code)`。
- **权限模型:** seed 常量(`scripts/seed/admin-rbac.ts` 的 `PERMISSIONS` + `ROLE_PERMISSION_MAP`);`requirePermission` → `canWithReason`,`platform_admin` 超级角色自动含全部权限。
- **P1 catalog-service(已合):** `createCatalogService(ctx)` → `getCurrent(): Promise<{yaml,version}>`、`apply(input:{yaml,expectedVersion?,source?}): Promise<{version,diff,report}>`、`listVersions()`、`getVersion(n): Promise<{version,yaml,diff}|undefined>`、`rollback({version,expectedVersion?})`。`source` 联合含 `'console'`。service 会抛 `ApiError`:`CONFLICT`(409,version 过期)、`NOT_FOUND`(404,回滚目标缺)、`VALIDATION_ERROR`(400,坏 YAML,带 `details.issues`)。
- **测试:** 集成 harness = `vi.mock('@/lib/auth')` + `createMigratedTestDb` + `seedAdminRbac` + 绑定测试管理员到 `platform_admin`(见 Task 3 verbatim);真实 PG+KC;`pnpm test:integration`(**不按文件名过滤,跑全量**,GREEN = 新测过 + 仅已知 flake `api-contract` 429 / `remediate-email-state` 失败)。单元 `pnpm test`(按名过滤)。
- **提交:** TDD,红→绿→commit;trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

---

## File Structure

**新建:**
- `app/api/admin/catalog/route.ts` — GET 当前目录。
- `app/api/admin/catalog/apply/route.ts` — POST apply。
- `app/api/admin/catalog/versions/route.ts` — GET 版本列表。
- `app/api/admin/catalog/versions/[version]/route.ts` — GET 单版本。
- `app/api/admin/catalog/rollback/route.ts` — POST 回滚。
- `tests/integration/catalog-api.test.ts` — 5 端点 + 权限 + 禁旧端点。
- `tests/unit/catalog-json-schema.test.ts`、`tests/unit/catalog-permissions.test.ts`。

**修改:**
- `scripts/seed/admin-rbac.ts` — 加 `catalog:read`/`catalog:apply` 到 `PERMISSIONS` + `app_admin`。
- `lib/catalog/schema.ts` — 加 `catalogJsonSchema` 导出。
- `lib/http/error-codes.ts` — 加 `CATALOG_MANAGED: 409`。
- `app/api/admin/applications/route.ts`(POST)、`app/api/admin/applications/[id]/route.ts`(PATCH)、`app/api/admin/applications/[id]/roles/route.ts`(POST)、`app/api/admin/applications/[id]/roles/[roleId]/route.ts`(PATCH)— 禁用。

---

### Task 1: 新增 catalog:read / catalog:apply 权限

**Files:**
- Modify: `scripts/seed/admin-rbac.ts`
- Test: `tests/unit/catalog-permissions.test.ts`

**Interfaces:**
- Produces: `PERMISSIONS` 含 `catalog:read`/`catalog:apply`;`ROLE_PERMISSION_MAP.app_admin` 含二者;`auditor` 经 `ALL_READ` 含 `catalog:read`。

- [ ] **Step 1: 写失败单测**

```ts
// tests/unit/catalog-permissions.test.ts
import { describe, expect, it } from 'vitest'
import { PERMISSIONS, ROLE_PERMISSION_MAP } from '@/scripts/seed/admin-rbac'

describe('catalog 权限', () => {
  it('PERMISSIONS 含 catalog:read + catalog:apply', () => {
    const codes = PERMISSIONS.map((p) => p.code)
    expect(codes).toContain('catalog:read')
    expect(codes).toContain('catalog:apply')
  })
  it('app_admin 含 catalog:read + catalog:apply', () => {
    expect(ROLE_PERMISSION_MAP.app_admin).toContain('catalog:read')
    expect(ROLE_PERMISSION_MAP.app_admin).toContain('catalog:apply')
  })
  it('auditor 经 ALL_READ 得 catalog:read(且不含 catalog:apply)', () => {
    expect(ROLE_PERMISSION_MAP.auditor).toContain('catalog:read')
    expect(ROLE_PERMISSION_MAP.auditor).not.toContain('catalog:apply')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test -- catalog-permissions`
Expected: FAIL(codes 不含 catalog:read）。

- [ ] **Step 3: 改 seed 常量**

`scripts/seed/admin-rbac.ts`:在 `PERMISSIONS` 数组里 `role:manage` 后加两行:
```ts
  { code: 'catalog:read', name: '查看目录' },
  { code: 'catalog:apply', name: '应用目录' },
```
把 `app_admin` 那行改为(在末尾追加两权限):
```ts
  app_admin: ['app:read', 'app:create', 'app:update', 'app:assign', 'app:revoke', 'role:read', 'role:manage', 'catalog:read', 'catalog:apply'],
```
(`auditor` 用 `ALL_READ`——`:read` 结尾自动含 `catalog:read`,无需改。)

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test -- catalog-permissions`
Expected: PASS(3 用例）。

- [ ] **Step 5: 提交**

```bash
git add scripts/seed/admin-rbac.ts tests/unit/catalog-permissions.test.ts
git commit -m "$(printf 'feat(catalog): catalog:read/apply 权限\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: 导出 catalogJsonSchema

**Files:**
- Modify: `lib/catalog/schema.ts`
- Test: `tests/unit/catalog-json-schema.test.ts`

**Interfaces:**
- Produces: `export const catalogJsonSchema` — `catalogDocSchema` 的 JSON Schema(结构级;`superRefine` 唯一性不在内)。

- [ ] **Step 1: 写失败单测**

```ts
// tests/unit/catalog-json-schema.test.ts
import { describe, expect, it } from 'vitest'
import { catalogJsonSchema } from '@/lib/catalog/schema'

describe('catalogJsonSchema', () => {
  it('是含 applications 的 JSON Schema 对象', () => {
    expect(catalogJsonSchema).toBeTypeOf('object')
    const s = JSON.stringify(catalogJsonSchema)
    expect(s).toContain('applications')
    expect(s).toContain('keycloak')
    expect(s).toContain('secretRef')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test -- catalog-json-schema`
Expected: FAIL(`catalogJsonSchema` 未导出）。

- [ ] **Step 3: 实现导出**

`lib/catalog/schema.ts` 末尾(类型导出后)加:
```ts
/** JSON Schema(喂前端 Monaco 做结构级校验/补全;唯一性等 superRefine 不在内,由服务端 apply 兜底) */
export const catalogJsonSchema = z.toJSONSchema(catalogDocSchema)
```
> **若 `z.toJSONSchema(catalogDocSchema)` 抛错**(顶层 `.superRefine` 不可表达):把 doc 对象抽出来,从对象生成 schema。即:
> ```ts
> const catalogDocObject = z.object({ version: z.literal(1), applications: z.array(catalogAppSchema) })
> export const catalogDocSchema = catalogDocObject.superRefine((doc, ctx) => { /* 原逻辑不变 */ })
> export const catalogJsonSchema = z.toJSONSchema(catalogDocObject)
> ```
> (只在直接方式抛错时改。运行 Step 4 判定。)

- [ ] **Step 4: 运行确认通过 + 全量单测**

Run: `pnpm test -- catalog-json-schema` 然后 `pnpm test`
Expected: PASS;全量单测不回归。

- [ ] **Step 5: 提交**

```bash
git add lib/catalog/schema.ts tests/unit/catalog-json-schema.test.ts
git commit -m "$(printf 'feat(catalog): 导出 catalogJsonSchema(zod v4 toJSONSchema)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: catalog 只读端点(GET catalog / versions / version)

**Files:**
- Create: `app/api/admin/catalog/route.ts`、`app/api/admin/catalog/versions/route.ts`、`app/api/admin/catalog/versions/[version]/route.ts`
- Create: `tests/integration/catalog-api.test.ts`(本任务建 harness + 只读断言)

**Interfaces:**
- Consumes: `adminRoute`/`ok`/`ApiError`(`@/app/api/_helpers`)、`createCatalogService`(`@/server/services/catalog-service`)。
- Produces: `GET /api/admin/catalog` → `{data:{yaml,version}}`;`GET /api/admin/catalog/versions` → `{data:{items:[…]}}`;`GET /api/admin/catalog/versions/[version]` → `{data:{version,yaml,diff}}` / 404。

- [ ] **Step 1: 写失败集成测(建 harness + 只读)**

```ts
// tests/integration/catalog-api.test.ts
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import { createKeycloakAdmin } from '@/lib/keycloak/admin-client'
import { seedAdminRbac } from '@/scripts/seed/admin-rbac'
import { __setServiceContextForTests, type ServiceContext } from '@/server/services/context'
import { getDbTargets } from './helpers/db-targets'
import { resolveAdminApiConfig } from './helpers/keycloak'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

const mockSession = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('@/lib/auth', () => ({
  auth: async () => mockSession.current,
  handlers: { GET: () => {}, POST: () => {} },
  signIn: async () => {},
  signOut: async () => {},
  ADMIN_CONSOLE_ROLE: 'admin_console_access',
}))

import { GET as getCatalog } from '@/app/api/admin/catalog/route'
import { GET as listVersions } from '@/app/api/admin/catalog/versions/route'
import { GET as getVersion } from '@/app/api/admin/catalog/versions/[version]/route'

const pg = getDbTargets()[0]
const suffix = randomUUID().slice(0, 8)
const ADMIN_SUB = `catalog-admin-${suffix}`
const adminSession = { user: { keycloakSub: ADMIN_SUB, email: 'cat@test.local', roles: ['admin_console_access'], isAdmin: true } }
const nonAdminSession = { user: { keycloakSub: 'nobody', email: 'no@test.local', roles: [], isAdmin: false } }

function req(method: string, path: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}
const p = (params: Record<string, string>) => ({ params: Promise.resolve(params) })

const DOC = (name = 'TianGong LCA 平台') => `
version: 1
applications:
  - code: tiangong-lca
    name: ${name}
    keycloak: { clientId: tiangong-lca-business-app, accessRole: tiangong_lca_access }
    roles:
      - { code: admin, name: 系统管理员 }
`

describe('catalog API(mock 会话 + 真实 PG/KC)', () => {
  let tdb: TestDb
  let ctx: ServiceContext
  beforeAll(async () => {
    tdb = await createMigratedTestDb(pg.adminUrl)
    ctx = { db: tdb.db, keycloak: createKeycloakAdmin(await resolveAdminApiConfig()) }
    __setServiceContextForTests(ctx)
    await seedAdminRbac(tdb.db)
    const [admin] = await tdb.db
      .insert(schema.portalUsers)
      .values({ keycloakSub: ADMIN_SUB, email: 'cat@test.local', status: 'active' })
      .returning()
    const role = await tdb.db.query.adminRoles.findFirst({ where: eq(schema.adminRoles.code, 'platform_admin') })
    await tdb.db.insert(schema.adminUserRoles).values({ portalUserId: admin.id, adminRoleId: role!.id, scopeType: 'global', scopeId: '' })
  })
  afterAll(async () => {
    __setServiceContextForTests(null)
    await tdb?.destroy()
  })

  it('未登录 GET /catalog → 401', async () => {
    mockSession.current = null
    const res = await getCatalog(req('GET', '/api/admin/catalog'))
    expect(res.status).toBe(401)
  })
  it('非管理员 → 403', async () => {
    mockSession.current = nonAdminSession
    const res = await getCatalog(req('GET', '/api/admin/catalog'))
    expect(res.status).toBe(403)
  })
  it('GET /catalog → {yaml, version}(空库 version 0)', async () => {
    mockSession.current = adminSession
    const res = await getCatalog(req('GET', '/api/admin/catalog'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveProperty('yaml')
    expect(body.data).toHaveProperty('version')
  })
  it('GET /catalog/versions → items[];单版本 404 再 apply 后可取', async () => {
    mockSession.current = adminSession
    const list0 = await (await listVersions(req('GET', '/api/admin/catalog/versions'))).json()
    expect(Array.isArray(list0.data.items)).toBe(true)
    // 直接用 service 造一个版本(apply 端点在 Task 4)
    await (await import('@/server/services/catalog-service')).createCatalogService(ctx).apply({ yaml: DOC(), source: 'console' })
    const v1res = await getVersion(req('GET', '/api/admin/catalog/versions/1'), p({ version: '1' }))
    expect(v1res.status).toBe(200)
    expect((await v1res.json()).data.version).toBe(1)
    const vMissing = await getVersion(req('GET', '/api/admin/catalog/versions/999'), p({ version: '999' }))
    expect(vMissing.status).toBe(404)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test:integration -- catalog-api`
Expected: FAIL(端点模块不存在)。

- [ ] **Step 3: 实现三个只读端点**

```ts
// app/api/admin/catalog/route.ts
import { adminRoute, ok } from '@/app/api/_helpers'
import { createCatalogService } from '@/server/services/catalog-service'

export const GET = adminRoute({ permission: 'catalog:read' }, async (_request, { requestId, ctx }) => {
  return ok(await createCatalogService(ctx).getCurrent(), requestId)
})
```
```ts
// app/api/admin/catalog/versions/route.ts
import { adminRoute, ok } from '@/app/api/_helpers'
import { createCatalogService } from '@/server/services/catalog-service'

export const GET = adminRoute({ permission: 'catalog:read' }, async (_request, { requestId, ctx }) => {
  const items = await createCatalogService(ctx).listVersions()
  return ok({ items }, requestId)
})
```
```ts
// app/api/admin/catalog/versions/[version]/route.ts
import { adminRoute, ApiError, ok } from '@/app/api/_helpers'
import { createCatalogService } from '@/server/services/catalog-service'

export const GET = adminRoute({ permission: 'catalog:read' }, async (_request, { requestId, ctx, params }) => {
  const version = Number(params.version)
  if (!Number.isInteger(version)) throw new ApiError('VALIDATION_ERROR', 'version 必须是整数')
  const row = await createCatalogService(ctx).getVersion(version)
  if (!row) throw new ApiError('NOT_FOUND', `目录版本 ${version} 不存在`)
  return ok(row, requestId)
})
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test:integration -- catalog-api`
Expected: PASS(新用例;仅已知 flake 可失败)。

- [ ] **Step 5: 提交**

```bash
git add app/api/admin/catalog/route.ts app/api/admin/catalog/versions tests/integration/catalog-api.test.ts
git commit -m "$(printf 'feat(catalog): 只读 API(GET catalog/versions/version)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4: catalog 写端点(POST apply / rollback)

**Files:**
- Create: `app/api/admin/catalog/apply/route.ts`、`app/api/admin/catalog/rollback/route.ts`
- Test: `tests/integration/catalog-api.test.ts`(追加 describe 块)

**Interfaces:**
- Produces: `POST /api/admin/catalog/apply` body `{yaml, expectedVersion?}` → `{data:{version,diff,report}}`;stale→409;坏 YAML→400。`POST /api/admin/catalog/rollback` body `{version, expectedVersion?}` → `{data:{version,diff,report}}`;缺→404。

- [ ] **Step 1: 写失败集成测(追加块)**

```ts
// tests/integration/catalog-api.test.ts —— 追加,复用文件顶部 harness/DOC/req/p
import { POST as applyCatalog } from '@/app/api/admin/catalog/apply/route'
import { POST as rollbackCatalog } from '@/app/api/admin/catalog/rollback/route'

describe('catalog 写端点', () => {
  // 复用上面的 beforeAll 建的 tdb/ctx/admin?——为隔离,这里另起一套(同 harness)。
  // 简化:把本块合进上面的 describe,共用 beforeAll 的 tdb/ctx/adminSession。
  it('POST /apply 首次 → 200 版本 1 + diff.created', async () => {
    mockSession.current = adminSession
    const res = await applyCatalog(req('POST', '/api/admin/catalog/apply', { yaml: DOC('新平台名') }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.version).toBeGreaterThanOrEqual(1)
    expect(body.data).toHaveProperty('diff')
    expect(body.data).toHaveProperty('report')
  })
  it('expectedVersion 过期 → 409 CONFLICT', async () => {
    mockSession.current = adminSession
    const res = await applyCatalog(req('POST', '/api/admin/catalog/apply', { yaml: DOC('再改'), expectedVersion: 0 }))
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('CONFLICT')
  })
  it('坏 YAML → 400 VALIDATION_ERROR', async () => {
    mockSession.current = adminSession
    const res = await applyCatalog(req('POST', '/api/admin/catalog/apply', { yaml: '::: not yaml :::' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR')
  })
  it('POST /rollback 不存在的版本 → 404', async () => {
    mockSession.current = adminSession
    const res = await rollbackCatalog(req('POST', '/api/admin/catalog/rollback', { version: 999 }))
    expect(res.status).toBe(404)
  })
})
```
> 注:把这些 `it` 合进 Task 3 的 `describe`(共用 `beforeAll` 的 `tdb/ctx/adminSession`),避免重复建库。上面的 import 提到文件顶部。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test:integration -- catalog-api`
Expected: FAIL(apply/rollback 端点不存在)。

- [ ] **Step 3: 实现两个写端点**

```ts
// app/api/admin/catalog/apply/route.ts
import { z } from 'zod'
import { adminRoute, ok, parseBody } from '@/app/api/_helpers'
import { createCatalogService } from '@/server/services/catalog-service'

const applySchema = z.object({ yaml: z.string(), expectedVersion: z.number().int().optional() })

export const POST = adminRoute({ permission: 'catalog:apply' }, async (request, { requestId, ctx }) => {
  const body = await parseBody(request, applySchema)
  const result = await createCatalogService(ctx).apply({
    yaml: body.yaml,
    expectedVersion: body.expectedVersion,
    source: 'console',
  })
  return ok(result, requestId)
})
```
```ts
// app/api/admin/catalog/rollback/route.ts
import { z } from 'zod'
import { adminRoute, ok, parseBody } from '@/app/api/_helpers'
import { createCatalogService } from '@/server/services/catalog-service'

const rollbackSchema = z.object({ version: z.number().int(), expectedVersion: z.number().int().optional() })

export const POST = adminRoute({ permission: 'catalog:apply' }, async (request, { requestId, ctx }) => {
  const body = await parseBody(request, rollbackSchema)
  const result = await createCatalogService(ctx).rollback({ version: body.version, expectedVersion: body.expectedVersion })
  return ok(result, requestId)
})
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test:integration -- catalog-api`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add app/api/admin/catalog/apply app/api/admin/catalog/rollback tests/integration/catalog-api.test.ts
git commit -m "$(printf 'feat(catalog): 写 API(POST apply/rollback,source=console)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 5: 禁用旧命令式写端点(CATALOG_MANAGED)

**Files:**
- Modify: `lib/http/error-codes.ts`
- Modify: `app/api/admin/applications/route.ts`、`app/api/admin/applications/[id]/route.ts`、`app/api/admin/applications/[id]/roles/route.ts`、`app/api/admin/applications/[id]/roles/[roleId]/route.ts`
- Test: `tests/integration/catalog-api.test.ts`(追加块)

**Interfaces:**
- Produces: `ERROR_CODES.CATALOG_MANAGED = 409`;上述 4 个写 handler → 抛 `CATALOG_MANAGED`(GET / assignments 不变)。

- [ ] **Step 1: 加错误码**

`lib/http/error-codes.ts` 的 `ERROR_CODES` 里(`CONFLICT: 409` 附近)加:
```ts
  CATALOG_MANAGED: 409,
```

- [ ] **Step 2: 写失败集成测(追加块)**

```ts
// tests/integration/catalog-api.test.ts —— 追加
import { POST as createApp } from '@/app/api/admin/applications/route'
import { PATCH as patchApp } from '@/app/api/admin/applications/[id]/route'
import { POST as createRole } from '@/app/api/admin/applications/[id]/roles/route'
import { PATCH as patchRole } from '@/app/api/admin/applications/[id]/roles/[roleId]/route'

describe('旧命令式写端点被禁用', () => {
  it('POST /applications → 409 CATALOG_MANAGED', async () => {
    mockSession.current = adminSession
    const res = await createApp(req('POST', '/api/admin/applications', { code: 'x-app', name: 'X', keycloakClientId: 'x' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('CATALOG_MANAGED')
  })
  it('PATCH /applications/[id] → 409 CATALOG_MANAGED', async () => {
    mockSession.current = adminSession
    const res = await patchApp(req('PATCH', '/api/admin/applications/abc', { name: 'Y' }), p({ id: 'abc' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('CATALOG_MANAGED')
  })
  it('POST /applications/[id]/roles → 409;PATCH roles/[roleId] → 409', async () => {
    mockSession.current = adminSession
    const r1 = await createRole(req('POST', '/api/admin/applications/abc/roles', { code: 'r', name: 'R' }), p({ id: 'abc' }))
    expect(r1.status).toBe(409)
    const r2 = await patchRole(req('PATCH', '/api/admin/applications/abc/roles/rid', { name: 'R2' }), p({ id: 'abc', roleId: 'rid' }))
    expect(r2.status).toBe(409)
  })
})
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm test:integration -- catalog-api`
Expected: FAIL(旧端点仍返回 201/200 或校验错，非 409 CATALOG_MANAGED)。

- [ ] **Step 4: 禁用 4 个 handler**

各文件把对应写 handler 的实现体替换为抛错(**保留 `adminRoute` 包装与 permission**,使非授权者仍先得 403;删掉不再用的 `parseBody`/schema/service 调用与相关 import 中变为未使用的项)。示例(`app/api/admin/applications/route.ts` 的 POST):
```ts
export const POST = adminRoute({ permission: 'app:create' }, async () => {
  throw new ApiError('CATALOG_MANAGED', '应用/角色定义由目录管理,请用目录编辑器 /admin/catalog')
})
```
- `applications/[id]/route.ts` 的 `PATCH`(`permission: 'app:update'`,含 scope):
```ts
export const PATCH = adminRoute(
  { permission: 'app:update', scope: (p) => ({ type: 'app', id: p.id }) },
  async () => {
    throw new ApiError('CATALOG_MANAGED', '应用/角色定义由目录管理,请用目录编辑器 /admin/catalog')
  },
)
```
- `applications/[id]/roles/route.ts` 的 `POST`(`role:manage`,scope)、`applications/[id]/roles/[roleId]/route.ts` 的 `PATCH`(`role:manage`,scope)同法。
- 确保各文件 `import { adminRoute, ApiError } from '@/app/api/_helpers'`(`ApiError` 已 re-export);移除变为未使用的 import(否则 lint 报错)。各文件的 **GET 保持不变**。

- [ ] **Step 5: 运行确认通过 + lint**

Run: `pnpm test:integration -- catalog-api` 然后 `pnpm lint`
Expected: PASS;lint 无未使用 import。

- [ ] **Step 6: 提交**

```bash
git add lib/http/error-codes.ts app/api/admin/applications tests/integration/catalog-api.test.ts
git commit -m "$(printf 'feat(catalog): 禁用旧命令式写端点(CATALOG_MANAGED)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 6: 全量验证 + docpact + PR

- [ ] **Step 1: 全量测试**

Run: `pnpm test && pnpm test:integration`
Expected: 全绿(仅已知 flake `api-contract` 429 / `remediate-email-state` 允许)。

- [ ] **Step 2: 类型 + lint**

Run: `pnpm lint`(+ typecheck 若有脚本)
Expected: 无 error。

- [ ] **Step 3: docpact gate + 清 required 文档**

Run(workspace 根):`scripts/docpact lint --root identity-center --merge-base origin/main`
触发:`identity-api-contract`(app/api/** → `.docpact/config.yaml`、`docs/design/02-application/02-api-design/README.md`、`docs/references/openapi.yaml`)、`identity-data-layer-contract`(lib/catalog、scripts/seed → 相应 docs)。逐一 review/更新 + `scripts/docpact review mark --root identity-center --path <doc> --commit <code SHA>`(两段式:代码提交=稳定 SHA;文档 marks 单独提交)。P1 已把 lib/catalog + scripts/seed 纳入 data-layer triggers,应无新 uncovered。
Expected: gate exit 0(0 missing-review;既有结构性 uncovered 不计)。

- [ ] **Step 4: 开 PR**

```bash
git push -u origin feat/catalog-console
gh pr create --base main --title "feat(catalog): 目录控制台 P2a(后端 API + 权限 + 禁旧端点)" --body "$(cat <<'BODY'
P2a:catalog HTTP API(GET/apply/versions/rollback)+ catalog:read/apply 权限 + catalogJsonSchema 导出 + 禁用旧命令式 app/角色定义写端点(CATALOG_MANAGED)。包 P1 catalog-service,不改后端逻辑。

设计:docs/implementation/plans/2026-07-07-catalog-console-p2-design.md
计划:docs/implementation/plans/2026-07-07-catalog-console-p2a-backend.md

P2b(控制台页 Monaco 编辑器 + 版本/回滚 UI + apps 只读化 + e2e)后续 PR。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

---

## Self-Review(写完对照 spec)

- **覆盖:** §5.1 五端点→T3/T4;§5.2 权限→T1;§5.3 JSON-schema→T2;§5.4 禁旧端点+CATALOG_MANAGED→T5;§7 错误映射(CONFLICT/VALIDATION/NOT_FOUND)→T4 断言;§8 集成测→T3-T5。**P2a 不含:** §5.5 控制台页、§5.6 apps 只读、§5.7 i18n、§8 e2e/单元 JSON-schema-行内(→ P2b)。
- **类型一致:** `createCatalogService` 方法签名(getCurrent/apply/listVersions/getVersion/rollback)贯穿 T3/T4;`catalog:read`/`catalog:apply`(T1)用于 T3/T4 端点;`CATALOG_MANAGED`(T5)。`adminRoute`/`ok`/`parseBody`/`ApiError` 均来自 `@/app/api/_helpers`。
- **无占位符:** 每步给出可运行代码/命令与预期。
- **Next 16 注意:** route handler 照抄现有 `adminRoute` 范式(params 为 Promise);写页面/复杂改动前读 `node_modules/next/dist/docs/`(P2b 更关键)。

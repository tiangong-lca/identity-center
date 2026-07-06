# 业务应用目录声明式配置 — P1(后端 MVP)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以声明式 YAML 目录取代 `seedBusinessApps`,作为业务应用注册真源,apply 时校验 → 事务物化到 `applications`/`application_roles` → 追加 `catalog_versions`(版本+审计+乐观并发)→ reconcile 到 Keycloak client roles;提供 `apply-catalog` CLI。**本 P1 不含控制台 UI(P2)与周期对账 job/导出/e2e(P3)。**

**Architecture:** 纯平台侧后端。采用 k8s `kubectl edit` 范式:DB 表为期望态真源,YAML 为编辑/交换格式,`catalog-service` 做 parse→校验→事务 upsert→版本;`catalog-reconcile-service` 把期望态(表)对齐到 Keycloak client roles(在**已有** client 上 ensure 角色,不建 client)。首份 `config/business-apps.yaml` 由现有 `APP`/`APP_ROLES` 常量转写。

**Tech Stack:** Next.js(App Router)、Drizzle ORM(PostgreSQL / KingbaseES 双库)、`@keycloak/keycloak-admin-client`、`js-yaml`(**新增**)、zod(已有 ^4.4.3)、Vitest(unit + integration 对真实容器)、pnpm。

设计依据:[`2026-07-06-declarative-app-catalog-design.md`](./2026-07-06-declarative-app-catalog-design.md)。

## Global Constraints

*(每个任务的要求都隐含包含本节;数值逐字照抄,不得改写。)*

- **分支:** 自 `origin/main` 创建的 `feat/declarative-app-catalog`(已建,spec 提交 `e363c07`);PR 回 `main`。
- **命名契约(逐字,不可变):** 应用 `code=tiangong-lca`;Keycloak Client ID=`tiangong-lca-business-app`;准入 Client Role=`tiangong_lca_access`;env=`TIANGONG_LCA_WEBHOOK_URL`、`TIANGONG_LCA_WEBHOOK_SECRET`、`TIANGONG_LCA_LOGIN_URL`。
- **应用角色(逐字):** `admin`(系统管理员)、`review-admin`(评审管理员)、`review-member`(评审成员);`member` 为应用默认标准身份**不登记**。
- **role.code 正则:** catalog 用 **`^[a-z0-9_-]+$`**(允许连字符,对齐真实数据 `review-admin`/`review-member`)。应用 `code` 用 `^[a-z0-9-]+$`(2–50)。⚠️ 现有 `POST /applications/[id]/roles` 的 `createRoleSchema` 用 `^[a-z0-9_]+$`(禁连字符,与真实数据矛盾)——实现中一并修正为允许连字符。
- **密钥:** YAML **只放 `secretRef`(env 变量名),永不放明文**;`webhook.secretRef` 格式 `^[A-Z][A-Z0-9_]*$`。
- **权限:** 复用现有 `app:read`/`app:create`/`app:update`,**不新造** `app:manage`(本 P1 不加 API 端点,权限在 P2 用)。
- **`pending_deactivate`:** 系统态,YAML 不可手写;仅 apply 时对「YAML 已移除但 DB 仍在」的条目置此状态(不删、不动已分配用户)。
- **仓库工作方式(GOAL.md §5):** 关键集成实现前先查证当前文档(Context7/官方),结论记 `docs/references/`;UI 文案一律 i18n 资源化(P1 无 UI);测试对真实容器,不 mock 掉被验证的集成点。
- **包管理器 pnpm;测试命令:** `pnpm test`(unit)、`pnpm test:integration`(需 `deploy/docker/docker-compose.dev.yml` 全服务运行)。
- **KC 边界:** reconcile 只在**已有** client 上 ensure client role;client 缺失 → 记 error 不阻断其它 app、**不创建 client**。
- **提交:** TDD,每个任务红→绿→commit;commit message 末尾附 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

---

## File Structure

**新建(create):**
- `identity-portal/lib/catalog/schema.ts` — zod schema + 类型(`CatalogDoc`/`CatalogApp`/`CatalogRole`)。纯,无 IO。
- `identity-portal/lib/catalog/serialize.ts` — `parseCatalogYaml(text, env)` / `renderCatalogYaml(apps)` / `toCatalogApps(appRows, roleRows)`(DB 行→CatalogApp)。依赖 `js-yaml`。纯。
- `identity-portal/lib/catalog/diff.ts` — `computeCatalogDiff(current, desired)` 纯函数 + `CatalogDiff` 类型。
- `identity-portal/db/schema/catalog-versions.ts` — `catalogVersions` 表。
- `identity-portal/server/services/catalog-reconcile-service.ts` — `createCatalogReconcileService(ctx)`:`ensureKeycloakRoles(apps)`(只 ensure accessRole)。
- `identity-portal/server/services/catalog-service.ts` — `createCatalogService(ctx)`:`apply` / `getCurrent` / `listVersions` / `getVersion` / `rollback`。
- `identity-portal/scripts/apply-catalog.ts` — CLI(`pnpm apply-catalog`)。
- `identity-portal/config/business-apps.yaml` — 首份目录(由 `APP`/`APP_ROLES` 转写)。
- `identity-portal/tests/unit/catalog-schema.test.ts`、`catalog-serialize.test.ts`、`catalog-diff.test.ts`
- `identity-portal/tests/integration/catalog-versions-migration.test.ts`、`catalog-reconcile-service.test.ts`、`catalog-service.test.ts`、`apply-catalog.test.ts`

**修改(modify):**
- `identity-portal/db/schema/index.ts` — 加 `export * from './catalog-versions'`。
- `identity-portal/db/schema/applications.ts:14,37` — `status` 注释加入 `pending_deactivate`(**text 列无需迁移**)。
- `identity-portal/package.json` — 加 `js-yaml`/`@types/js-yaml` 依赖 + `"apply-catalog"` 脚本。
- `identity-portal/scripts/seed-portal-db.ts` — 用 catalog apply 取代 `seedBusinessApps` 调用。
- `identity-portal/app/api/admin/applications/[id]/roles/route.ts:14` — role.code 正则 `^[a-z0-9_]+$` → `^[a-z0-9_-]+$`(修既有不一致)。

**删除(delete):**
- `identity-portal/scripts/seed/business-apps.ts` + `identity-portal/tests/integration/seed-business-apps.test.ts`(seed 退休,由 catalog 取代)。

> **docpact:** `db/schema/**`、`server/services/**`、`lib/**`、`app/api/**` 均在治理内。实现完成后在开 PR 前运行仓库 docpact gate 并按提示 mark 相关 requiredDocs(见 Task 10)。`lib/catalog/**` 为新路径,若 gate 报 `coverage-uncovered-change`,在 `.docpact/config.yaml` 把 `lib/catalog/**` 纳入 `identity-data-layer-contract` 或新增覆盖(Task 10 处理)。

---

### Task 1: catalog zod schema + 类型

**Files:**
- Create: `identity-portal/lib/catalog/schema.ts`
- Test: `identity-portal/tests/unit/catalog-schema.test.ts`

**Interfaces:**
- Produces: `catalogDocSchema`(zod)、`catalogAppSchema`、`catalogRoleSchema`;类型 `CatalogDoc`、`CatalogApp`、`CatalogRole`。`CatalogApp = { code; name; status: 'active'|'disabled'; keycloak: { clientId; accessRole }; webhook?: { url; secretRef }; loginUrl?; adminUrl?; roles: CatalogRole[] }`。`CatalogRole = { code; name; description? }`。

- [ ] **Step 1: 写失败测试**

```ts
// tests/unit/catalog-schema.test.ts
import { describe, expect, it } from 'vitest'
import { catalogDocSchema } from '@/lib/catalog/schema'

const valid = {
  version: 1,
  applications: [
    {
      code: 'tiangong-lca',
      name: 'TianGong LCA 平台',
      keycloak: { clientId: 'tiangong-lca-business-app', accessRole: 'tiangong_lca_access' },
      webhook: { url: 'http://x/hook', secretRef: 'TIANGONG_LCA_WEBHOOK_SECRET' },
      roles: [
        { code: 'admin', name: '系统管理员' },
        { code: 'review-admin', name: '评审管理员', description: '评审流程管理员' },
      ],
    },
  ],
}

describe('catalogDocSchema', () => {
  it('合法文档通过,status 默认 active,roles 默认 []', () => {
    const doc = catalogDocSchema.parse(valid)
    expect(doc.applications[0].status).toBe('active')
    expect(doc.applications[0].roles).toHaveLength(2)
  })
  it('role.code 允许连字符(review-admin)', () => {
    expect(() => catalogDocSchema.parse(valid)).not.toThrow()
  })
  it('app.code 非法(大写)被拒', () => {
    const bad = structuredClone(valid)
    bad.applications[0].code = 'TianGong'
    expect(() => catalogDocSchema.parse(bad)).toThrow()
  })
  it('secretRef 为明文样式(小写)被拒', () => {
    const bad = structuredClone(valid)
    bad.applications[0].webhook.secretRef = 'super-secret-value'
    expect(() => catalogDocSchema.parse(bad)).toThrow()
  })
  it('同文件重复 app code 被拒', () => {
    const bad = structuredClone(valid)
    bad.applications.push(structuredClone(valid.applications[0]))
    expect(() => catalogDocSchema.parse(bad)).toThrow(/重复应用 code/)
  })
  it('应用内重复 role code 被拒', () => {
    const bad = structuredClone(valid)
    bad.applications[0].roles.push({ code: 'admin', name: '重复' })
    expect(() => catalogDocSchema.parse(bad)).toThrow(/重复角色 code/)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test -- catalog-schema`
Expected: FAIL(`Cannot find module '@/lib/catalog/schema'`)。

- [ ] **Step 3: 实现 schema**

```ts
// lib/catalog/schema.ts
import { z } from 'zod'

/** 业务角色目录项(不含默认 member;经 webhook 交付,不建 KC client role) */
export const catalogRoleSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9_-]+$/, 'role code 仅限小写字母/数字/下划线/连字符'),
  name: z.string().min(1).max(100),
  description: z.string().max(300).optional(),
})

export const catalogAppSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'app code 仅限小写字母/数字/连字符'),
  name: z.string().min(1).max(100),
  status: z.enum(['active', 'disabled']).default('active'),
  keycloak: z.object({
    clientId: z.string().min(1),
    accessRole: z.string().min(1),
  }),
  webhook: z
    .object({
      url: z.string().min(1),
      secretRef: z
        .string()
        .regex(/^[A-Z][A-Z0-9_]*$/, 'secretRef 必须是 env 变量名(不放明文)'),
    })
    .optional(),
  loginUrl: z.string().optional(),
  adminUrl: z.string().optional(),
  roles: z.array(catalogRoleSchema).default([]),
})

export const catalogDocSchema = z
  .object({
    version: z.literal(1),
    applications: z.array(catalogAppSchema),
  })
  .superRefine((doc, ctx) => {
    const appCodes = new Set<string>()
    doc.applications.forEach((app, i) => {
      if (appCodes.has(app.code)) {
        ctx.addIssue({ code: 'custom', message: `重复应用 code: ${app.code}`, path: ['applications', i, 'code'] })
      }
      appCodes.add(app.code)
      const roleCodes = new Set<string>()
      app.roles.forEach((role, j) => {
        if (roleCodes.has(role.code)) {
          ctx.addIssue({ code: 'custom', message: `应用 ${app.code} 内重复角色 code: ${role.code}`, path: ['applications', i, 'roles', j, 'code'] })
        }
        roleCodes.add(role.code)
      })
    })
  })

export type CatalogRole = z.infer<typeof catalogRoleSchema>
export type CatalogApp = z.infer<typeof catalogAppSchema>
export type CatalogDoc = z.infer<typeof catalogDocSchema>
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test -- catalog-schema`
Expected: PASS(6 个用例)。

- [ ] **Step 5: 提交**

```bash
git add lib/catalog/schema.ts tests/unit/catalog-schema.test.ts
git commit -m "$(printf 'feat(catalog): catalog zod schema + 类型\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: serialize(YAML ⇄ 结构)+ js-yaml 依赖

**Files:**
- Create: `identity-portal/lib/catalog/serialize.ts`
- Modify: `identity-portal/package.json`(依赖)
- Test: `identity-portal/tests/unit/catalog-serialize.test.ts`

**Interfaces:**
- Consumes: `catalogDocSchema`、`CatalogApp`(Task 1)。
- Produces: `parseCatalogYaml(text: string, env?: NodeJS.ProcessEnv): CatalogDoc`;`renderCatalogYaml(apps: CatalogApp[]): string`;`toCatalogApps(appRows, roleRows): CatalogApp[]`(DB 行→CatalogApp,过滤 `pending_deactivate`)。

- [ ] **Step 1: 装依赖**

Run: `pnpm add js-yaml && pnpm add -D @types/js-yaml`
Expected: `package.json` 出现 `js-yaml` 与 `@types/js-yaml`。

- [ ] **Step 2: 写失败测试**

```ts
// tests/unit/catalog-serialize.test.ts
import { describe, expect, it } from 'vitest'
import { parseCatalogYaml, renderCatalogYaml, toCatalogApps } from '@/lib/catalog/serialize'

const yamlText = `
version: 1
applications:
  - code: tiangong-lca
    name: TianGong LCA 平台
    keycloak: { clientId: tiangong-lca-business-app, accessRole: tiangong_lca_access }
    webhook: { url: \${TIANGONG_LCA_WEBHOOK_URL}, secretRef: TIANGONG_LCA_WEBHOOK_SECRET }
    loginUrl: \${TIANGONG_LCA_LOGIN_URL}
    roles:
      - { code: admin, name: 系统管理员 }
      - { code: review-admin, name: 评审管理员 }
`

describe('parseCatalogYaml', () => {
  it('解析 + ${ENV} 插值(url/loginUrl 用 env,secretRef 不插值)', () => {
    const doc = parseCatalogYaml(yamlText, {
      TIANGONG_LCA_WEBHOOK_URL: 'http://localhost:54321/functions/v1/identity_center_webhook',
      TIANGONG_LCA_LOGIN_URL: 'http://localhost:8000/#/user/login',
    } as NodeJS.ProcessEnv)
    expect(doc.applications[0].webhook?.url).toBe('http://localhost:54321/functions/v1/identity_center_webhook')
    expect(doc.applications[0].webhook?.secretRef).toBe('TIANGONG_LCA_WEBHOOK_SECRET')
    expect(doc.applications[0].loginUrl).toBe('http://localhost:8000/#/user/login')
  })
  it('可选字段的 ${ENV} 未定义 → 该字段省略(不报错)', () => {
    const doc = parseCatalogYaml(yamlText, {} as NodeJS.ProcessEnv)
    expect(doc.applications[0].webhook).toBeUndefined()
    expect(doc.applications[0].loginUrl).toBeUndefined()
  })
  it('非法 YAML 抛错', () => {
    expect(() => parseCatalogYaml('::: not yaml :::')).toThrow()
  })
})

describe('renderCatalogYaml + toCatalogApps 回环', () => {
  it('DB 行 → CatalogApp → YAML → 再解析,应用/角色保持', () => {
    const apps = toCatalogApps(
      [{ id: 'a1', code: 'tiangong-lca', name: 'TianGong LCA 平台', status: 'active', keycloakClientId: 'tiangong-lca-business-app', accessClientRole: 'tiangong_lca_access', webhookUrl: 'http://x/hook', webhookSecretRef: 'TIANGONG_LCA_WEBHOOK_SECRET', loginUrl: null, adminUrl: null }],
      [{ id: 'r1', applicationId: 'a1', code: 'admin', name: '系统管理员', description: null, status: 'active' }],
    )
    const text = renderCatalogYaml(apps)
    const doc = parseCatalogYaml(text, {} as NodeJS.ProcessEnv)
    expect(doc.applications[0].code).toBe('tiangong-lca')
    expect(doc.applications[0].roles.map((r) => r.code)).toEqual(['admin'])
  })
  it('toCatalogApps 过滤 pending_deactivate 的应用与角色', () => {
    const apps = toCatalogApps(
      [{ id: 'a1', code: 'gone', name: 'X', status: 'pending_deactivate', keycloakClientId: 'c', accessClientRole: 'c_access', webhookUrl: null, webhookSecretRef: null, loginUrl: null, adminUrl: null }],
      [],
    )
    expect(apps).toHaveLength(0)
  })
})
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm test -- catalog-serialize`
Expected: FAIL(模块不存在)。

- [ ] **Step 4: 实现 serialize**

```ts
// lib/catalog/serialize.ts
import yaml from 'js-yaml'
import { catalogDocSchema, type CatalogApp, type CatalogDoc } from './schema'

const ENV_WHOLE = /^\$\{([A-Z][A-Z0-9_]*)\}$/
const ENV_INLINE = /\$\{([A-Z][A-Z0-9_]*)\}/g

/** 整值即 ${NAME} 且未定义 → undefined(可选字段落空);否则内联替换,未定义按空串 */
function interpolate(value: unknown, env: NodeJS.ProcessEnv): unknown {
  if (typeof value !== 'string') return value
  const whole = value.match(ENV_WHOLE)
  if (whole) return env[whole[1]]
  return value.replace(ENV_INLINE, (_, name) => env[name] ?? '')
}

function interpolateApp(app: Record<string, unknown>, env: NodeJS.ProcessEnv): Record<string, unknown> {
  const out: Record<string, unknown> = { ...app }
  if ('loginUrl' in out) {
    const v = interpolate(out.loginUrl, env)
    if (v === undefined) delete out.loginUrl
    else out.loginUrl = v
  }
  if ('adminUrl' in out) {
    const v = interpolate(out.adminUrl, env)
    if (v === undefined) delete out.adminUrl
    else out.adminUrl = v
  }
  if (out.webhook && typeof out.webhook === 'object') {
    const w = { ...(out.webhook as Record<string, unknown>) }
    const url = interpolate(w.url, env)
    if (url === undefined) delete out.webhook // url 缺失 → 整个 webhook 省略(secretRef 不单独插值)
    else out.webhook = { ...w, url }
  }
  return out
}

/** 解析 YAML 文本 → ${ENV} 插值 → zod 校验 → CatalogDoc */
export function parseCatalogYaml(text: string, env: NodeJS.ProcessEnv = process.env): CatalogDoc {
  const raw = yaml.load(text)
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('catalog YAML 为空或非对象')
  }
  const doc = raw as Record<string, unknown>
  const apps = Array.isArray(doc.applications) ? doc.applications : []
  return catalogDocSchema.parse({
    ...doc,
    applications: apps.map((a) => interpolateApp(a as Record<string, unknown>, env)),
  })
}

type AppRow = {
  id: string
  code: string
  name: string
  status: string
  keycloakClientId: string
  accessClientRole: string
  webhookUrl: string | null
  webhookSecretRef: string | null
  loginUrl: string | null
  adminUrl: string | null
}
type RoleRow = {
  id: string
  applicationId: string
  code: string
  name: string
  description: string | null
  status: string
}

/** DB 行 → CatalogApp[](排除 pending_deactivate 的应用与角色;这些是待停用墓碑,不进可编辑 YAML) */
export function toCatalogApps(appRows: AppRow[], roleRows: RoleRow[]): CatalogApp[] {
  return appRows
    .filter((a) => a.status !== 'pending_deactivate')
    .map((a) => ({
      code: a.code,
      name: a.name,
      status: (a.status === 'disabled' ? 'disabled' : 'active') as 'active' | 'disabled',
      keycloak: { clientId: a.keycloakClientId, accessRole: a.accessClientRole },
      webhook: a.webhookUrl
        ? { url: a.webhookUrl, secretRef: a.webhookSecretRef ?? '' }
        : undefined,
      loginUrl: a.loginUrl ?? undefined,
      adminUrl: a.adminUrl ?? undefined,
      roles: roleRows
        .filter((r) => r.applicationId === a.id && r.status !== 'pending_deactivate')
        .map((r) => ({ code: r.code, name: r.name, description: r.description ?? undefined })),
    }))
}

/** CatalogApp[] → YAML 文本(secretRef 原样;url 输出已解析值,不反解 ${ENV}) */
export function renderCatalogYaml(apps: CatalogApp[]): string {
  const doc: CatalogDoc = { version: 1, applications: apps }
  return yaml.dump(doc, { lineWidth: 100, noRefs: true, sortKeys: false })
}
```

- [ ] **Step 5: 运行确认通过**

Run: `pnpm test -- catalog-serialize`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add lib/catalog/serialize.ts package.json pnpm-lock.yaml tests/unit/catalog-serialize.test.ts
git commit -m "$(printf 'feat(catalog): YAML 序列化/解析 + %s 插值(js-yaml)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>' '${ENV}')"
```

---

### Task 3: computeCatalogDiff(纯函数)

**Files:**
- Create: `identity-portal/lib/catalog/diff.ts`
- Test: `identity-portal/tests/unit/catalog-diff.test.ts`

**Interfaces:**
- Consumes: `CatalogApp`(Task 1)。
- Produces: `CatalogDiff = { created: string[]; updated: string[]; unchanged: string[]; pendingDeactivate: string[]; roles: { created: string[]; updated: string[]; pendingDeactivate: string[] } }`(roles 元素为 `"appCode/roleCode"`);`computeCatalogDiff(current: CatalogApp[], desired: CatalogApp[]): CatalogDiff`;`hasChanges(diff: CatalogDiff): boolean`。

- [ ] **Step 1: 写失败测试**

```ts
// tests/unit/catalog-diff.test.ts
import { describe, expect, it } from 'vitest'
import { computeCatalogDiff, hasChanges } from '@/lib/catalog/diff'
import type { CatalogApp } from '@/lib/catalog/schema'

const app = (over: Partial<CatalogApp> = {}): CatalogApp => ({
  code: 'tiangong-lca',
  name: 'TianGong LCA 平台',
  status: 'active',
  keycloak: { clientId: 'tiangong-lca-business-app', accessRole: 'tiangong_lca_access' },
  roles: [{ code: 'admin', name: '系统管理员' }],
  ...over,
})

describe('computeCatalogDiff', () => {
  it('新增应用', () => {
    const d = computeCatalogDiff([], [app()])
    expect(d.created).toEqual(['tiangong-lca'])
    expect(hasChanges(d)).toBe(true)
  })
  it('同内容 → unchanged,hasChanges=false', () => {
    const d = computeCatalogDiff([app()], [app()])
    expect(d.unchanged).toEqual(['tiangong-lca'])
    expect(d.created).toEqual([])
    expect(hasChanges(d)).toBe(false)
  })
  it('改名 → updated', () => {
    const d = computeCatalogDiff([app()], [app({ name: '新名' })])
    expect(d.updated).toEqual(['tiangong-lca'])
  })
  it('YAML 移除应用 → pendingDeactivate', () => {
    const d = computeCatalogDiff([app()], [])
    expect(d.pendingDeactivate).toEqual(['tiangong-lca'])
  })
  it('新增/移除角色 → roles.created / roles.pendingDeactivate', () => {
    const d = computeCatalogDiff(
      [app({ roles: [{ code: 'admin', name: '系统管理员' }] })],
      [app({ roles: [{ code: 'review-admin', name: '评审管理员' }] })],
    )
    expect(d.roles.created).toEqual(['tiangong-lca/review-admin'])
    expect(d.roles.pendingDeactivate).toEqual(['tiangong-lca/admin'])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test -- catalog-diff`
Expected: FAIL(模块不存在)。

- [ ] **Step 3: 实现 diff**

```ts
// lib/catalog/diff.ts
import type { CatalogApp, CatalogRole } from './schema'

export type CatalogDiff = {
  created: string[]
  updated: string[]
  unchanged: string[]
  pendingDeactivate: string[]
  roles: { created: string[]; updated: string[]; pendingDeactivate: string[] }
}

function appEqual(a: CatalogApp, b: CatalogApp): boolean {
  return (
    a.name === b.name &&
    a.status === b.status &&
    a.keycloak.clientId === b.keycloak.clientId &&
    a.keycloak.accessRole === b.keycloak.accessRole &&
    (a.webhook?.url ?? null) === (b.webhook?.url ?? null) &&
    (a.webhook?.secretRef ?? null) === (b.webhook?.secretRef ?? null) &&
    (a.loginUrl ?? null) === (b.loginUrl ?? null) &&
    (a.adminUrl ?? null) === (b.adminUrl ?? null)
  )
}

function roleEqual(a: CatalogRole, b: CatalogRole): boolean {
  return a.name === b.name && (a.description ?? null) === (b.description ?? null)
}

export function computeCatalogDiff(current: CatalogApp[], desired: CatalogApp[]): CatalogDiff {
  const diff: CatalogDiff = {
    created: [],
    updated: [],
    unchanged: [],
    pendingDeactivate: [],
    roles: { created: [], updated: [], pendingDeactivate: [] },
  }
  const curByCode = new Map(current.map((a) => [a.code, a]))
  const desiredByCode = new Map(desired.map((a) => [a.code, a]))

  for (const d of desired) {
    const c = curByCode.get(d.code)
    if (!c) diff.created.push(d.code)
    else if (!appEqual(c, d)) diff.updated.push(d.code)
    else diff.unchanged.push(d.code)

    const curRoles = new Map((c?.roles ?? []).map((r) => [r.code, r]))
    const desiredRoles = new Map(d.roles.map((r) => [r.code, r]))
    for (const dr of d.roles) {
      const cr = curRoles.get(dr.code)
      if (!cr) diff.roles.created.push(`${d.code}/${dr.code}`)
      else if (!roleEqual(cr, dr)) diff.roles.updated.push(`${d.code}/${dr.code}`)
    }
    for (const cr of c?.roles ?? []) {
      if (!desiredRoles.has(cr.code)) diff.roles.pendingDeactivate.push(`${d.code}/${cr.code}`)
    }
  }
  for (const c of current) {
    if (!desiredByCode.has(c.code)) diff.pendingDeactivate.push(c.code)
  }
  return diff
}

export function hasChanges(diff: CatalogDiff): boolean {
  return (
    diff.created.length > 0 ||
    diff.updated.length > 0 ||
    diff.pendingDeactivate.length > 0 ||
    diff.roles.created.length > 0 ||
    diff.roles.updated.length > 0 ||
    diff.roles.pendingDeactivate.length > 0
  )
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test -- catalog-diff`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add lib/catalog/diff.ts tests/unit/catalog-diff.test.ts
git commit -m "$(printf 'feat(catalog): computeCatalogDiff 纯函数\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4: `catalog_versions` 表 + 迁移 + status 值扩展

**Files:**
- Create: `identity-portal/db/schema/catalog-versions.ts`
- Modify: `identity-portal/db/schema/index.ts`、`identity-portal/db/schema/applications.ts`(注释)
- Create(生成物): `identity-portal/db/migrations/0003_*.sql` + `meta/0003_snapshot.json`
- Test: `identity-portal/tests/integration/catalog-versions-migration.test.ts`

**Interfaces:**
- Produces: `catalogVersions` 表(`id`、`version` int unique、`yaml` text、`diff` jsonb、`appliedBy` text、`source` text default `'cli'`、`appliedAt` timestamptz)。`status` 列新增合法值 `pending_deactivate`(text,无 CHECK,不需迁移)。

- [ ] **Step 1: 写失败测试**

```ts
// tests/integration/catalog-versions-migration.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getDbTargets } from './helpers/db-targets'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

describe('catalog_versions 迁移', () => {
  let tdb: TestDb
  beforeAll(async () => {
    const [pg] = getDbTargets()
    tdb = await createMigratedTestDb(pg.adminUrl)
  })
  afterAll(async () => (tdb ? tdb.destroy() : undefined))

  it('表存在,可插入并读回', async () => {
    await tdb.db.insert(schema.catalogVersions).values({ version: 1, yaml: 'version: 1', appliedBy: 'system' })
    const rows = await tdb.db.query.catalogVersions.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ version: 1, appliedBy: 'system', source: 'cli' })
  })

  it('version 唯一约束生效', async () => {
    await expect(
      tdb.db.insert(schema.catalogVersions).values({ version: 1, yaml: 'x', appliedBy: 'system' }),
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test:integration -- catalog-versions-migration`
Expected: FAIL(`schema.catalogVersions` 不存在 / 迁移无该表)。

- [ ] **Step 3: 写表定义**

```ts
// db/schema/catalog-versions.ts
import { sql } from 'drizzle-orm'
import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidPk } from './_shared'

/** 目录 apply 的追加式版本日志:审计 / 回滚源 / 乐观并发令牌(当前版本 = max(version)) */
export const catalogVersions = pgTable('catalog_versions', {
  id: uuidPk(),
  version: integer('version').notNull().unique(),
  /** 该次 apply 的完整 YAML(secretRef 形态,无明文) */
  yaml: text('yaml').notNull(),
  /** 结构化变更摘要(CatalogDiff) */
  diff: jsonb('diff'),
  appliedBy: text('applied_by').notNull(),
  /** console | cli | import */
  source: text('source').notNull().default('cli'),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().default(sql`now()`),
})
```

- [ ] **Step 4: 注册到 barrel + 扩 status 注释**

`db/schema/index.ts` 增行:
```ts
export * from './catalog-versions'
```
`db/schema/applications.ts` 把两处 status 注释更新(值语义,text 列无需迁移):
```ts
  /** active | disabled | pending_deactivate(pending_deactivate 由 catalog reconcile 置,待人工确认停用) */
  status: text('status').notNull().default('active'),
```
(第 14 行 `applications.status` 与第 37 行 `applicationRoles.status` 同样更新注释。)

- [ ] **Step 5: 生成迁移**

Run: `pnpm db:generate`
Expected: 新增 `db/migrations/0003_*.sql`(含 `CREATE TABLE "catalog_versions"` + `version` 的 UNIQUE 约束)与 `meta/0003_snapshot.json`、`_journal.json` 追加一条。检查 `.sql` 只含 `catalog_versions` 建表(status 注释改动不产生 DDL)。

- [ ] **Step 6: 运行确认通过**

Run: `pnpm test:integration -- catalog-versions-migration`
Expected: PASS(2 个用例)。

- [ ] **Step 7: 提交**

```bash
git add db/schema/catalog-versions.ts db/schema/index.ts db/schema/applications.ts db/migrations tests/integration/catalog-versions-migration.test.ts
git commit -m "$(printf 'feat(catalog): catalog_versions 表 + status 扩 pending_deactivate\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 5: catalog-reconcile-service(只 ensure accessRole)

**Files:**
- Create: `identity-portal/server/services/catalog-reconcile-service.ts`
- Test: `identity-portal/tests/integration/catalog-reconcile-service.test.ts`

**Interfaces:**
- Consumes: `ServiceContext`(`server/services/context.ts`:`{ db, keycloak }`);`ctx.keycloak.findClientByClientId(clientId)`、`ctx.keycloak.ensureClientRole(clientUniqueId, roleName)`。
- Produces: `createCatalogReconcileService(ctx)` → `{ ensureKeycloakRoles(apps): Promise<ReconcileReport> }`;`ReconcileReport = { ensured: string[]; clientMissing: string[]; errors: Array<{ appCode: string; message: string }> }`;`apps` 元素 `{ code: string; keycloakClientId: string; accessClientRole: string }`。

- [ ] **Step 1: 写失败测试(真实 Keycloak)**

```ts
// tests/integration/catalog-reconcile-service.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createKeycloakAdmin } from '@/lib/keycloak/admin-client'
import { createCatalogReconcileService } from '@/server/services/catalog-reconcile-service'
import type { ServiceContext } from '@/server/services/context'
import { resolveAdminApiConfig } from './helpers/keycloak'

describe('catalog-reconcile-service(真实 Keycloak)', () => {
  let ctx: ServiceContext
  beforeAll(async () => {
    ctx = { db: {} as ServiceContext['db'], keycloak: createKeycloakAdmin(await resolveAdminApiConfig()) }
  })

  it('已有 client → ensure accessRole 幂等成功', async () => {
    const svc = createCatalogReconcileService(ctx)
    const apps = [{ code: 'tiangong-lca', keycloakClientId: 'tiangong-lca-business-app', accessClientRole: 'tiangong_lca_access' }]
    const r1 = await svc.ensureKeycloakRoles(apps)
    const r2 = await svc.ensureKeycloakRoles(apps)
    expect(r1.ensured).toContain('tiangong-lca-business-app/tiangong_lca_access')
    expect(r2.ensured).toContain('tiangong-lca-business-app/tiangong_lca_access')
    expect(r1.clientMissing).toEqual([])
  })

  it('client 不存在 → 记 clientMissing,不阻断其它 app', async () => {
    const svc = createCatalogReconcileService(ctx)
    const r = await svc.ensureKeycloakRoles([
      { code: 'ghost', keycloakClientId: 'no-such-client', accessClientRole: 'ghost_access' },
      { code: 'tiangong-lca', keycloakClientId: 'tiangong-lca-business-app', accessClientRole: 'tiangong_lca_access' },
    ])
    expect(r.clientMissing).toEqual(['ghost'])
    expect(r.ensured).toContain('tiangong-lca-business-app/tiangong_lca_access')
  })
})
```

> 前置:`pnpm bootstrap:keycloak` 已跑(realm `company-dev` + client `tiangong-lca-business-app` 存在),且 `deploy/docker/docker-compose.dev.yml` 的 Keycloak 在运行。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test:integration -- catalog-reconcile-service`
Expected: FAIL(模块不存在)。

- [ ] **Step 3: 实现 reconcile-service**

```ts
// server/services/catalog-reconcile-service.ts
import type { ServiceContext } from './context'

export type ReconcileApp = {
  code: string
  keycloakClientId: string
  accessClientRole: string
}

export type ReconcileReport = {
  ensured: string[]
  clientMissing: string[]
  errors: Array<{ appCode: string; message: string }>
}

/**
 * 目录 reconcile 控制器:期望态(表)→ KC 实际态。
 * 只在**已有** client 上 ensure 准入 accessRole(client role);不建 client、不为业务角色建 KC 角色。
 * 逐 app 隔离:单 app 失败/缺 client 不阻断其它。
 */
export function createCatalogReconcileService(ctx: ServiceContext) {
  return {
    async ensureKeycloakRoles(apps: ReconcileApp[]): Promise<ReconcileReport> {
      const report: ReconcileReport = { ensured: [], clientMissing: [], errors: [] }
      for (const app of apps) {
        try {
          const client = await ctx.keycloak.findClientByClientId(app.keycloakClientId)
          if (!client?.id) {
            report.clientMissing.push(app.code)
            continue
          }
          await ctx.keycloak.ensureClientRole(client.id, app.accessClientRole)
          report.ensured.push(`${app.keycloakClientId}/${app.accessClientRole}`)
        } catch (e) {
          report.errors.push({ appCode: app.code, message: e instanceof Error ? e.message : String(e) })
        }
      }
      return report
    },
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test:integration -- catalog-reconcile-service`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add server/services/catalog-reconcile-service.ts tests/integration/catalog-reconcile-service.test.ts
git commit -m "$(printf 'feat(catalog): reconcile-service ensure 准入 accessRole\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 6: catalog-service `apply` + `getCurrent`

**Files:**
- Create: `identity-portal/server/services/catalog-service.ts`
- Test: `identity-portal/tests/integration/catalog-service.test.ts`

**Interfaces:**
- Consumes: `ServiceContext`;`parseCatalogYaml`/`renderCatalogYaml`/`toCatalogApps`(Task 2)、`computeCatalogDiff`/`hasChanges`(Task 3)、`createCatalogReconcileService`(Task 5)、`createAuditLogRepository`(`server/repositories/audit-log-repository`)、`ApiError`(`@/lib/http/api-error`)、`getAuditContext`(`@/lib/audit/context`)、`schema`、`eq`/`desc`(drizzle)。
- Produces: `createCatalogService(ctx)` → `{ apply, getCurrent, ... }`。`apply(input: { yaml: string; expectedVersion?: number; source?: 'console'|'cli'|'import' }): Promise<{ version: number; diff: CatalogDiff; report: ReconcileReport }>`;`getCurrent(): Promise<{ yaml: string; version: number }>`。冲突 → `throw new ApiError('CONFLICT', ...)`。

- [ ] **Step 1: 写失败测试(真实 PG + Keycloak)**

```ts
// tests/integration/catalog-service.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createKeycloakAdmin } from '@/lib/keycloak/admin-client'
import { createCatalogService } from '@/server/services/catalog-service'
import type { ServiceContext } from '@/server/services/context'
import { getDbTargets } from './helpers/db-targets'
import { resolveAdminApiConfig } from './helpers/keycloak'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

const DOC = (name = 'TianGong LCA 平台', roles = ['admin', 'review-admin']) => `
version: 1
applications:
  - code: tiangong-lca
    name: ${name}
    keycloak: { clientId: tiangong-lca-business-app, accessRole: tiangong_lca_access }
    roles:
${roles.map((r) => `      - { code: ${r}, name: ${r} }`).join('\n')}
`

describe('catalog-service.apply(真实 PG + Keycloak)', () => {
  let tdb: TestDb
  let ctx: ServiceContext
  beforeAll(async () => {
    const [pg] = getDbTargets()
    tdb = await createMigratedTestDb(pg.adminUrl)
    ctx = { db: tdb.db, keycloak: createKeycloakAdmin(await resolveAdminApiConfig()) }
  })
  afterAll(async () => (tdb ? tdb.destroy() : undefined))

  it('首次 apply 建应用+角色+版本 1,reconcile ensured', async () => {
    const svc = createCatalogService(ctx)
    const r = await svc.apply({ yaml: DOC(), source: 'cli' })
    expect(r.version).toBe(1)
    expect(r.diff.created).toEqual(['tiangong-lca'])
    expect(r.report.ensured).toContain('tiangong-lca-business-app/tiangong_lca_access')
    const apps = await tdb.db.query.applications.findMany()
    expect(apps[0]).toMatchObject({ code: 'tiangong-lca', accessClientRole: 'tiangong_lca_access' })
  })

  it('同内容再 apply → 无变更,版本不变', async () => {
    const svc = createCatalogService(ctx)
    const r = await svc.apply({ yaml: DOC() })
    expect(r.version).toBe(1)
    expect(r.diff.created).toEqual([])
    expect(r.diff.unchanged).toEqual(['tiangong-lca'])
  })

  it('改名 → 版本 2 + updated', async () => {
    const svc = createCatalogService(ctx)
    const r = await svc.apply({ yaml: DOC('新名') })
    expect(r.version).toBe(2)
    expect(r.diff.updated).toEqual(['tiangong-lca'])
  })

  it('移除一个角色 → 该角色 pending_deactivate', async () => {
    const svc = createCatalogService(ctx)
    await svc.apply({ yaml: DOC('新名', ['admin']) })
    const roles = await tdb.db.query.applicationRoles.findMany()
    const removed = roles.find((r) => r.code === 'review-admin')
    expect(removed?.status).toBe('pending_deactivate')
  })

  it('getCurrent 返回渲染 YAML + 当前版本', async () => {
    const svc = createCatalogService(ctx)
    const cur = await svc.getCurrent()
    expect(cur.version).toBeGreaterThanOrEqual(3)
    expect(cur.yaml).toContain('code: tiangong-lca')
  })

  it('expectedVersion 过期 → CONFLICT', async () => {
    const svc = createCatalogService(ctx)
    await expect(svc.apply({ yaml: DOC('再改'), expectedVersion: 1 })).rejects.toThrow(/CONFLICT|版本冲突/)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test:integration -- catalog-service`
Expected: FAIL(模块不存在)。

- [ ] **Step 3: 实现 catalog-service(apply + getCurrent)**

```ts
// server/services/catalog-service.ts
import { desc, eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { getAuditContext } from '@/lib/audit/context'
import { computeCatalogDiff, hasChanges, type CatalogDiff } from '@/lib/catalog/diff'
import { parseCatalogYaml, renderCatalogYaml, toCatalogApps } from '@/lib/catalog/serialize'
import { ApiError } from '@/lib/http/api-error'
import { createAuditLogRepository } from '@/server/repositories/audit-log-repository'
import { createCatalogReconcileService, type ReconcileReport } from './catalog-reconcile-service'
import type { ServiceContext } from './context'

function actorOf() {
  const c = getAuditContext()
  return {
    actorKeycloakSub: c?.actor?.keycloakSub ?? 'system',
    actorEmail: c?.actor?.email,
    requestId: c?.requestId,
    traceId: c?.traceId,
    operationId: c?.operationId,
  }
}

export type ApplyInput = { yaml: string; expectedVersion?: number; source?: 'console' | 'cli' | 'import' }
export type ApplyResult = { version: number; diff: CatalogDiff; report: ReconcileReport }

export function createCatalogService(ctx: ServiceContext) {
  const audit = createAuditLogRepository(ctx.db)
  const reconcile = createCatalogReconcileService(ctx)

  async function currentVersion(runner: Pick<ServiceContext['db'], 'select'>): Promise<number> {
    const [latest] = await runner
      .select({ version: schema.catalogVersions.version })
      .from(schema.catalogVersions)
      .orderBy(desc(schema.catalogVersions.version))
      .limit(1)
    return latest?.version ?? 0
  }

  return {
    async getCurrent(): Promise<{ yaml: string; version: number }> {
      const apps = await ctx.db.query.applications.findMany()
      const roles = await ctx.db.query.applicationRoles.findMany()
      const version = await currentVersion(ctx.db)
      return { yaml: renderCatalogYaml(toCatalogApps(apps, roles)), version }
    },

    async apply(input: ApplyInput): Promise<ApplyResult> {
      const doc = parseCatalogYaml(input.yaml) // 语法/schema/业务(唯一性)校验;失败即抛
      const { version, diff } = await ctx.db.transaction(async (tx) => {
        const curVer = await currentVersion(tx)
        if (input.expectedVersion !== undefined && input.expectedVersion !== curVer) {
          throw new ApiError('CONFLICT', `目录版本冲突:期望 ${input.expectedVersion},当前 ${curVer}`)
        }
        const curAppRows = await tx.query.applications.findMany()
        const curRoleRows = await tx.query.applicationRoles.findMany()
        const diff = computeCatalogDiff(toCatalogApps(curAppRows, curRoleRows), doc.applications)
        if (!hasChanges(diff)) return { version: curVer, diff }

        for (const app of doc.applications) {
          const existing = curAppRows.find((a) => a.code === app.code)
          const values = {
            code: app.code,
            name: app.name,
            status: app.status,
            keycloakClientId: app.keycloak.clientId,
            accessClientRole: app.keycloak.accessRole,
            webhookUrl: app.webhook?.url ?? null,
            webhookSecretRef: app.webhook?.secretRef ?? null,
            loginUrl: app.loginUrl ?? null,
            adminUrl: app.adminUrl ?? null,
          }
          let appId: string
          if (existing) {
            await tx.update(schema.applications).set({ ...values, updatedAt: new Date() }).where(eq(schema.applications.id, existing.id))
            appId = existing.id
          } else {
            const [row] = await tx.insert(schema.applications).values(values).returning()
            appId = row.id
          }
          const existingRoles = curRoleRows.filter((r) => r.applicationId === appId)
          const desiredCodes = new Set(app.roles.map((r) => r.code))
          for (const role of app.roles) {
            const er = existingRoles.find((r) => r.code === role.code)
            if (er) {
              await tx.update(schema.applicationRoles).set({ name: role.name, description: role.description ?? null, status: 'active', updatedAt: new Date() }).where(eq(schema.applicationRoles.id, er.id))
            } else {
              await tx.insert(schema.applicationRoles).values({ applicationId: appId, code: role.code, name: role.name, description: role.description ?? null, status: 'active' })
            }
          }
          for (const er of existingRoles) {
            if (!desiredCodes.has(er.code) && er.status !== 'pending_deactivate') {
              await tx.update(schema.applicationRoles).set({ status: 'pending_deactivate', updatedAt: new Date() }).where(eq(schema.applicationRoles.id, er.id))
            }
          }
        }
        const desiredAppCodes = new Set(doc.applications.map((a) => a.code))
        for (const a of curAppRows) {
          if (!desiredAppCodes.has(a.code) && a.status !== 'pending_deactivate') {
            await tx.update(schema.applications).set({ status: 'pending_deactivate', updatedAt: new Date() }).where(eq(schema.applications.id, a.id))
          }
        }
        const newVersion = curVer + 1
        await tx.insert(schema.catalogVersions).values({
          version: newVersion,
          yaml: input.yaml,
          diff,
          appliedBy: actorOf().actorKeycloakSub,
          source: input.source ?? 'cli',
        })
        return { version: newVersion, diff }
      })

      // reconcile(事务提交后;只对 active 应用 ensure 准入 accessRole)
      const report = await reconcile.ensureKeycloakRoles(
        doc.applications
          .filter((a) => a.status === 'active')
          .map((a) => ({ code: a.code, keycloakClientId: a.keycloak.clientId, accessClientRole: a.keycloak.accessRole })),
      )

      if (hasChanges(diff)) {
        await audit.append({
          ...actorOf(),
          action: 'catalog.apply',
          targetType: 'catalog',
          targetId: String(version),
          afterData: { version, diff },
          result: 'success',
        })
      }
      return { version, diff, report }
    },
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test:integration -- catalog-service`
Expected: PASS(6 个用例)。

- [ ] **Step 5: 提交**

```bash
git add server/services/catalog-service.ts tests/integration/catalog-service.test.ts
git commit -m "$(printf 'feat(catalog): catalog-service apply + getCurrent(事务+版本+乐观并发+reconcile)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 7: catalog-service `listVersions` / `getVersion` / `rollback`

**Files:**
- Modify: `identity-portal/server/services/catalog-service.ts`
- Test: `identity-portal/tests/integration/catalog-service.test.ts`(追加)

**Interfaces:**
- Produces: `listVersions(): Promise<Array<{ id: string; version: number; appliedBy: string; source: string; appliedAt: Date }>>`;`getVersion(version: number): Promise<{ version: number; yaml: string; diff: CatalogDiff | null } | undefined>`;`rollback(input: { version: number; expectedVersion?: number }): Promise<ApplyResult>`(取历史 yaml 走 `apply`,`source: 'import'`)。

- [ ] **Step 1: 写失败测试(追加到 catalog-service.test.ts)**

```ts
// tests/integration/catalog-service.test.ts —— 追加一个 describe 块
describe('catalog-service 版本 + 回滚', () => {
  let tdb2: TestDb
  let ctx2: ServiceContext
  beforeAll(async () => {
    const [pg] = getDbTargets()
    tdb2 = await createMigratedTestDb(pg.adminUrl)
    ctx2 = { db: tdb2.db, keycloak: createKeycloakAdmin(await resolveAdminApiConfig()) }
  })
  afterAll(async () => (tdb2 ? tdb2.destroy() : undefined))

  it('listVersions 按版本倒序;rollback 到旧 yaml 产生新版本并恢复名字', async () => {
    const svc = createCatalogService(ctx2)
    await svc.apply({ yaml: DOC('原名') }) // v1
    await svc.apply({ yaml: DOC('改名') }) // v2
    const versions = await svc.listVersions()
    expect(versions[0].version).toBe(2)

    const r = await svc.rollback({ version: 1 }) // 回到"原名"
    expect(r.version).toBe(3)
    const apps = await tdb2.db.query.applications.findMany()
    expect(apps[0].name).toBe('原名')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test:integration -- catalog-service`
Expected: FAIL(`svc.listVersions is not a function`)。

- [ ] **Step 3: 在 catalog-service 的返回对象里补三个方法**

在 `return { getCurrent, apply, ... }` 中,`apply` 之后追加:
```ts
    async listVersions() {
      return ctx.db
        .select({
          id: schema.catalogVersions.id,
          version: schema.catalogVersions.version,
          appliedBy: schema.catalogVersions.appliedBy,
          source: schema.catalogVersions.source,
          appliedAt: schema.catalogVersions.appliedAt,
        })
        .from(schema.catalogVersions)
        .orderBy(desc(schema.catalogVersions.version))
    },

    async getVersion(version: number) {
      const [row] = await ctx.db
        .select({ version: schema.catalogVersions.version, yaml: schema.catalogVersions.yaml, diff: schema.catalogVersions.diff })
        .from(schema.catalogVersions)
        .where(eq(schema.catalogVersions.version, version))
        .limit(1)
      return row as { version: number; yaml: string; diff: CatalogDiff | null } | undefined
    },

    async rollback(input: { version: number; expectedVersion?: number }): Promise<ApplyResult> {
      const target = await this.getVersion(input.version)
      if (!target) throw new ApiError('NOT_FOUND', `目录版本 ${input.version} 不存在`)
      return this.apply({ yaml: target.yaml, expectedVersion: input.expectedVersion, source: 'import' })
    },
```
> `apply`/`getVersion` 通过 `this` 互调,故 `return { ... }` 用对象方法简写(已是)。若 lint 对 `this` 有异议,把 `getVersion`/`apply` 提为闭包内具名函数再在对象里引用。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test:integration -- catalog-service`
Expected: PASS(含新块)。

- [ ] **Step 5: 提交**

```bash
git add server/services/catalog-service.ts tests/integration/catalog-service.test.ts
git commit -m "$(printf 'feat(catalog): 版本列表/查看/回滚\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 8: `apply-catalog` CLI + 首份 `config/business-apps.yaml`

**Files:**
- Create: `identity-portal/scripts/apply-catalog.ts`、`identity-portal/config/business-apps.yaml`
- Modify: `identity-portal/package.json`(脚本)
- Test: `identity-portal/tests/integration/apply-catalog.test.ts`

**Interfaces:**
- Consumes: `createCatalogService`、`createDbClient`(`@/lib/db/client`)、`createKeycloakAdmin`/`keycloakConfigFromEnv`(`@/lib/keycloak/admin-client`)。
- Produces: 复用函数 `applyCatalogFromFile(ctx: ServiceContext, filePath: string, opts?: { check?: boolean }): Promise<ApplyResult | { diff: CatalogDiff; dryRun: true }>`;CLI 入口 `scripts/apply-catalog.ts`(`pnpm apply-catalog [--file <path>] [--check]`,默认 `config/business-apps.yaml`)。

- [ ] **Step 1: 写首份 YAML**

```yaml
# config/business-apps.yaml —— 业务应用目录(声明式真源;由 seedBusinessApps 的 APP/APP_ROLES 转写)
# 密钥只放 secretRef(env 变量名),url 用 ${ENV} 占位(部署环境注入)
version: 1
applications:
  - code: tiangong-lca
    name: TianGong LCA 平台
    status: active
    keycloak:
      clientId: tiangong-lca-business-app
      accessRole: tiangong_lca_access
    webhook:
      url: ${TIANGONG_LCA_WEBHOOK_URL}
      secretRef: TIANGONG_LCA_WEBHOOK_SECRET
    loginUrl: ${TIANGONG_LCA_LOGIN_URL}
    roles:
      - { code: admin, name: 系统管理员, description: TianGong LCA 系统管理员 }
      - { code: review-admin, name: 评审管理员, description: 评审流程管理员 }
      - { code: review-member, name: 评审成员, description: 评审成员 }
```

- [ ] **Step 2: 写失败测试**

```ts
// tests/integration/apply-catalog.test.ts
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { createKeycloakAdmin } from '@/lib/keycloak/admin-client'
import type { ServiceContext } from '@/server/services/context'
import { applyCatalogFromFile } from '@/scripts/apply-catalog'
import { getDbTargets } from './helpers/db-targets'
import { resolveAdminApiConfig } from './helpers/keycloak'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

describe('applyCatalogFromFile(config/business-apps.yaml)', () => {
  let tdb: TestDb
  let ctx: ServiceContext
  beforeAll(async () => {
    const [pg] = getDbTargets()
    tdb = await createMigratedTestDb(pg.adminUrl)
    ctx = { db: tdb.db, keycloak: createKeycloakAdmin(await resolveAdminApiConfig()) }
  })
  afterAll(async () => (tdb ? tdb.destroy() : undefined))

  it('从文件 apply,登记 tiangong-lca + 3 角色', async () => {
    const r = await applyCatalogFromFile(ctx, 'config/business-apps.yaml')
    expect('version' in r && r.version).toBe(1)
    const apps = await tdb.db.query.applications.findMany()
    expect(apps[0]).toMatchObject({ code: 'tiangong-lca', keycloakClientId: 'tiangong-lca-business-app', accessClientRole: 'tiangong_lca_access', webhookSecretRef: 'TIANGONG_LCA_WEBHOOK_SECRET' })
    const roles = await tdb.db.query.applicationRoles.findMany({ where: eq(schema.applicationRoles.applicationId, apps[0].id) })
    expect(roles.map((r) => r.code).sort()).toEqual(['admin', 'review-admin', 'review-member'])
  })

  it('--check 干跑不写库', async () => {
    const tdb2 = await createMigratedTestDb(getDbTargets()[0].adminUrl)
    const ctx2: ServiceContext = { db: tdb2.db, keycloak: ctx.keycloak }
    const r = await applyCatalogFromFile(ctx2, 'config/business-apps.yaml', { check: true })
    expect('dryRun' in r && r.dryRun).toBe(true)
    expect(await tdb2.db.query.applications.findMany()).toHaveLength(0)
    await tdb2.destroy()
  })
})
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm test:integration -- apply-catalog`
Expected: FAIL(模块不存在)。

- [ ] **Step 4: 实现 CLI + 复用函数**

```ts
// scripts/apply-catalog.ts
/**
 * 业务应用目录 apply(声明式):
 *   pnpm apply-catalog                 # 应用 config/business-apps.yaml
 *   pnpm apply-catalog -- --file x.yaml
 *   pnpm apply-catalog -- --check      # 干跑:只算 diff、不写库/不碰 KC
 * 前置:DATABASE_URL、KEYCLOAK_*(reconcile 用);Keycloak 在运行。
 */
import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { createDbClient } from '@/lib/db/client'
import { computeCatalogDiff, type CatalogDiff } from '@/lib/catalog/diff'
import { parseCatalogYaml, toCatalogApps } from '@/lib/catalog/serialize'
import { createKeycloakAdmin, keycloakConfigFromEnv } from '@/lib/keycloak/admin-client'
import { createCatalogService, type ApplyResult } from '@/server/services/catalog-service'
import type { ServiceContext } from '@/server/services/context'

export async function applyCatalogFromFile(
  ctx: ServiceContext,
  filePath: string,
  opts: { check?: boolean } = {},
): Promise<ApplyResult | { diff: CatalogDiff; dryRun: true }> {
  const text = await readFile(filePath, 'utf8')
  if (opts.check) {
    const doc = parseCatalogYaml(text)
    const apps = await ctx.db.query.applications.findMany()
    const roles = await ctx.db.query.applicationRoles.findMany()
    return { diff: computeCatalogDiff(toCatalogApps(apps, roles), doc.applications), dryRun: true }
  }
  return createCatalogService(ctx).apply({ yaml: text, source: 'cli' })
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL 未配置')
  const file = argValue('--file') ?? 'config/business-apps.yaml'
  const check = process.argv.includes('--check')
  const client = createDbClient(url)
  try {
    const ctx: ServiceContext = { db: client.db, keycloak: createKeycloakAdmin(keycloakConfigFromEnv()) }
    const result = await applyCatalogFromFile(ctx, file, { check })
    console.log(check ? '[apply-catalog] 干跑 diff:' : '[apply-catalog] 已应用:')
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await client.close()
  }
}

// 仅作为脚本直接运行时执行 main(被测试 import 时不跑)
if (process.argv[1] && process.argv[1].endsWith('apply-catalog.ts')) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
```

- [ ] **Step 5: 加 package.json 脚本**

在 `scripts` 段(紧随 `"db:seed"` 后)增行:
```json
    "apply-catalog": "tsx scripts/apply-catalog.ts",
```

- [ ] **Step 6: 运行确认通过**

Run: `pnpm test:integration -- apply-catalog`
Expected: PASS(2 个用例)。

- [ ] **Step 7: 提交**

```bash
git add scripts/apply-catalog.ts config/business-apps.yaml package.json tests/integration/apply-catalog.test.ts
git commit -m "$(printf 'feat(catalog): apply-catalog CLI + 首份 business-apps.yaml\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 9: 退休 `seedBusinessApps`

**Files:**
- Modify: `identity-portal/scripts/seed-portal-db.ts`
- Delete: `identity-portal/scripts/seed/business-apps.ts`、`identity-portal/tests/integration/seed-business-apps.test.ts`
- Modify: `identity-portal/app/api/admin/applications/[id]/roles/route.ts:14`(修 role.code 正则)

**Interfaces:**
- Consumes: `applyCatalogFromFile`(Task 8)、`createKeycloakAdmin`/`keycloakConfigFromEnv`。
- Produces: `seed-portal-db.ts` 用 catalog apply 登记业务应用(取代 `seedBusinessApps`)。

- [ ] **Step 1: 改 seed-portal-db.ts 用 catalog apply**

把 `import { seedBusinessApps } from './seed/business-apps'` 删除;`import` 段加:
```ts
import { createKeycloakAdmin, keycloakConfigFromEnv } from '@/lib/keycloak/admin-client'
import { applyCatalogFromFile } from './apply-catalog'
```
把 `await seedBusinessApps(client.db)` 一行替换为:
```ts
    await applyCatalogFromFile(
      { db: client.db, keycloak: createKeycloakAdmin(keycloakConfigFromEnv()) },
      'config/business-apps.yaml',
    )
```
(下一行日志 `console.log('业务应用目录就绪(tiangong-lca + 3 角色)')` 保留。)

- [ ] **Step 2: 修既有 role.code 正则不一致**

`app/api/admin/applications/[id]/roles/route.ts` 第 14 行:
```ts
  code: z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/),
```
(把 `^[a-z0-9_]+$` 改为 `^[a-z0-9_-]+$`,与真实数据 `review-admin` 及 catalog 一致。)

- [ ] **Step 3: 删除退休文件**

Run:
```bash
git rm scripts/seed/business-apps.ts tests/integration/seed-business-apps.test.ts
```

- [ ] **Step 4: 跑受影响的测试面 + 全量 seed 冒烟**

Run: `pnpm test:integration -- apply-catalog catalog-service` 确认仍 PASS(seed 路径复用同一函数)。
Expected: PASS,且 `rg "seedBusinessApps" identity-portal` 无残留引用(除本计划文档)。

- [ ] **Step 5: 提交**

```bash
git add scripts/seed-portal-db.ts app/api/admin/applications/\[id\]/roles/route.ts
git commit -m "$(printf 'refactor(catalog): 退休 seedBusinessApps,seed 改用 catalog apply;修 role.code 正则\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 10: 全量验证 + docpact gate

**Files:** 无代码变更(必要时按 gate 提示改 `.docpact/config.yaml` 或 docs)。

- [ ] **Step 1: 单元 + 集成全绿**

Run: `pnpm test && pnpm test:integration`
Expected: 全绿(需 `deploy/docker/docker-compose.dev.yml` 全服务 + `pnpm bootstrap:keycloak` 已跑)。

- [ ] **Step 2: 类型 + lint**

Run: `pnpm lint`(如有 `typecheck` 脚本一并跑)
Expected: 无 error。

- [ ] **Step 3: 冒烟 apply-catalog 干跑**

Run: `pnpm apply-catalog -- --check`
Expected: 打印 diff JSON(对空库应为 `created: ['tiangong-lca']`),不写库。

- [ ] **Step 4: docpact gate + 清 required 文档**

Run(workspace 根):`bash scripts/docpact-gate.sh --root identity-center --base origin/main`

本 P1 变更触发的规则与 requiredDocs(逐一 review/更新后,用 `scripts/docpact review mark --path <doc> --commit <code SHA>` 清引用;**两段式**:代码提交=稳定 SHA,文档 marks 单独提交并引用该 SHA,只 amend 文档提交):
- `db/schema/**`(catalog-versions.ts、applications.ts 注释)→ **identity-data-layer-contract** → `.docpact/config.yaml`、`docs/design/02-application/04-project-structure-design/README.md`、`docs/references/kingbasees-compatibility-conventions.md`、`docs/references/kingbasees-environment.md`。
- `server/services/**`(catalog-service、catalog-reconcile-service)→ **identity-sync-and-jobs-contract** → `.docpact/config.yaml`、`docs/design/02-application/03-sync-event-design/README.md`、`docs/design/01-architecture/01-overall-architecture/README.md`。
- `app/api/**`(roles/route.ts 正则)→ **identity-api-contract** → `.docpact/config.yaml`、`docs/design/02-application/02-api-design/README.md`、`docs/references/openapi.yaml`。
- `package.json`(js-yaml + apply-catalog)→ **identity-testing-and-gate-contract** → `.docpact/config.yaml`、`docs/implementation/definition-of-done.md`、`docs/implementation/README.md`。
- 新路径 `lib/catalog/**`、`scripts/apply-catalog.ts`、`config/business-apps.yaml` 若报 **coverage-uncovered-change**:在 `.docpact/config.yaml` 把它们纳入相应规则(`lib/catalog/**` 归 data-layer 序列化层;`config/**` 可加 `coverage.exclude` 或新覆盖)。改 `.docpact/config.yaml` 本身触发 **identity-bootstrap-contract** → 同步 review `docs/README.md`、`GOAL.md`、`docs/implementation/README.md`。

Expected: gate 通过(0 违规)。docpact 命令细节参见既有 plan `2026-07-03-tiangong-lca-app-registration.md` 的收尾惯例。

- [ ] **Step 5: 开 PR**

Run:
```bash
git push -u origin feat/declarative-app-catalog
gh pr create --base main --title "feat(catalog): 业务应用目录声明式配置 P1(后端)" --body "$(cat <<'BODY'
实现声明式业务应用目录 P1(后端 MVP):YAML → 校验 → 事务物化 applications/application_roles + catalog_versions(版本/审计/乐观并发)→ reconcile KC 准入 accessRole;apply-catalog CLI 取代 seedBusinessApps。

设计:docs/implementation/plans/2026-07-06-declarative-app-catalog-design.md
计划:docs/implementation/plans/2026-07-06-declarative-app-catalog-p1.md

P2(控制台 Monaco 编辑器 + 禁用旧写端点)、P3(周期对账 job + export + e2e)后续单独 PR。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```
Expected: PR 开在 identity-center 仓,base=main。

---

## Self-Review(写完对照 spec)

- **Spec 覆盖:** §5.2 status 扩展→Task 4;§5.3 catalog_versions→Task 4;§5.4 乐观并发→Task 6;§6 YAML schema→Task 1/2;§7.1 schema→T1;§7.2 serialize→T2;§7.3 catalog-service(apply/getCurrent/version/rollback)→T6/T7;§7.4 reconcile→T5;§7.6 CLI→T8;§9 行为(三层校验/upsert/pending_deactivate/幂等/并发)→T1-2/T6;§12 seed 退休→T9;§13 安全(secretRef 校验)→T1;role.code 不一致修正→T9。**P1 不含:** §7.5 控制台(P2)、§7.7 周期 job(P3)、§7.6 export-catalog(P3)、detectDrift(P3)、禁用旧写端点(P2)——已在 Goal 与阶段说明中标注。
- **类型一致:** `CatalogApp`/`CatalogDoc`(T1)贯穿 T2/T3/T6;`ReconcileReport`(T5)用于 T6;`ApplyResult`(T6)用于 T7/T8;`CatalogDiff`(T3)用于 T6/T8。方法名 `apply`/`getCurrent`/`listVersions`/`getVersion`/`rollback`/`ensureKeycloakRoles`/`applyCatalogFromFile` 前后一致。
- **无占位符:** 每步给出可运行代码/命令与预期。


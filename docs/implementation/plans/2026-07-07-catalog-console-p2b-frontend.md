# 目录控制台 P2b(前端:控制台页 + Monaco + 版本/回滚 + apps 只读)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/catalog` 管理控制台:Monaco YAML 编辑器(kubectl-edit 流)+ apply(diff/错误)+ 版本历史/回滚 + apps 管理页定义只读化。**依赖 P2a 的 catalog API 已在分支上。**

**Architecture:** 沿用「thin server page → `'use client'` view + TanStack react-query + Sonner + shadcn v4」。Monaco 走 `dynamic(ssr:false)`;schema-aware 用 `monaco-yaml`(有 Tier-1 高亮-only 兜底,服务端 apply 才是权威校验)。

**Tech Stack:** Next.js 16、React、TanStack react-query ^5、next-intl、shadcn v4/radix、sonner、`@monaco-editor/react` + `monaco-editor` + `monaco-yaml`(**新增**)、Playwright、pnpm。

设计依据:[`2026-07-07-catalog-console-p2-design.md`](./2026-07-07-catalog-console-p2-design.md)。**前置:** P2a(catalog API + `catalogJsonSchema` + `catalog:*` 权限 + 禁旧端点)。

## Global Constraints

- **分支:** `feat/catalog-console`(P2a、P2b 同分支;最后一个 PR 到 main）。
- **⚠️ Next.js 16 破坏性变更**(AGENTS.md):写页面/组件前读 `node_modules/next/dist/docs/` 相关章节。Server component page 用 `getTranslations('catalog')`;client view `'use client'` + `useTranslations`。`params` 为 `Promise`。
- **前端范式(exploration 实证):** page = thin server component(`app/admin/<f>/page.tsx`)→ `features/<f>/*-view.tsx`('use client')。数据 `apiFetch`(`features/shared/api.ts`,解 `{data}` 信封,抛 `ApiClientError{code,message,status,details}`)+ react-query(`useQuery`/`useMutation` + `queryClient.invalidateQueries`)。toast:`import { toast } from 'sonner'`。i18n:`messages/{en,zh-CN}/<ns>.json`(顶层键=namespace),**parity 测试要求双语齐**。UI:`@/components/ui/{button,dialog,alert-dialog,tabs,card,badge,skeleton,table}`。
- **P2a API(consumes):** `GET /api/admin/catalog`→`{yaml,version}`;`POST /api/admin/catalog/apply`{yaml,expectedVersion?}→`{version,diff,report}`(409 CONFLICT/400 VALIDATION_ERROR.details.issues);`GET /api/admin/catalog/versions`→`{items:[{id,version,appliedBy,source,appliedAt}]}`;`GET /api/admin/catalog/versions/[version]`→`{version,yaml,diff}`;`POST /api/admin/catalog/rollback`{version,expectedVersion?}→`{version,diff,report}`。`catalogJsonSchema`(`@/lib/catalog/schema`)喂 monaco-yaml。
- **测试:** e2e playwright(`tests/e2e/`,双语 `name:/中文|EN/` 正则,预置 admin auth,`pnpm test:e2e`);组件逻辑尽量抽纯函数单测。`pnpm lint` + typecheck。
- **提交:** 每任务红→绿(或页面可跑)→commit;trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

---

## File Structure

**新建:**
- `features/catalog/catalog-editor.tsx` — Monaco YAML 编辑器(dynamic ssr:false + monaco-yaml + schema)。
- `features/catalog/queries.ts` — react-query hooks。
- `features/catalog/catalog-view.tsx` — 页面主体('use client')。
- `features/catalog/version-history.tsx` — 版本列表 + 回滚。
- `app/admin/catalog/page.tsx` — thin server page。
- `messages/en/catalog.json` + `messages/zh-CN/catalog.json`。
- `tests/e2e/catalog-console.spec.ts`。

**修改:**
- `components/layout/admin-shell.tsx` — `NAV_ITEMS` 加 catalog。
- `features/apps/apps-view.tsx`、`features/apps/app-detail-view.tsx`(+ 相关 form/dialog/hook)— 定义只读化。
- `messages/{en,zh-CN}/apps.json` — 只读提示文案。

---

### Task 1: Monaco YAML 编辑器组件(风险任务,先做)

**Files:**
- Create: `features/catalog/catalog-editor.tsx`
- Modify: `package.json`(依赖)

**Interfaces:**
- Produces: `<CatalogEditor value onChange readOnly? />` — 渲染 YAML 编辑器,schema-aware(用 `catalogJsonSchema`)。

- [ ] **Step 1: 装依赖**

Run: `pnpm add @monaco-editor/react monaco-editor monaco-yaml`
Expected: 三个包入 `package.json`。

- [ ] **Step 2: 查证 Next 16 + monaco-yaml worker 接法**

用 Context7 查 `@monaco-editor/react`(`/suren-atoyan/monaco-react`)+ 读 `node_modules/monaco-yaml/README` + `node_modules/next/dist/docs/` 关于 web worker。**已知路径**:`dynamic(ssr:false)` 包 `@monaco-editor/react`;`beforeMount(monaco)` 里 `configureMonacoYaml(monaco, { enableSchemaRequest:false, schemas:[{ uri:'inmemory://catalog.json', fileMatch:['*'], schema: catalogJsonSchema }] })`;worker 用 `window.MonacoEnvironment = { getWorker(_, label){ if(label==='yaml') return new Worker(new URL('monaco-yaml/yaml.worker', import.meta.url)); return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker', import.meta.url)) } }`(Next.js webpack 支持 `new Worker(new URL(...,import.meta.url))`)。查证结论记 `docs/references/2026-07-07-monaco-yaml-nextjs.md`。

- [ ] **Step 3: 实现组件**

```tsx
// features/catalog/catalog-editor.tsx
'use client'
import dynamic from 'next/dynamic'
import type { OnChange, OnMount, BeforeMount } from '@monaco-editor/react'
import { catalogJsonSchema } from '@/lib/catalog/schema'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="h-[60vh] animate-pulse rounded bg-muted" />,
})

export function CatalogEditor({
  value,
  onChange,
  readOnly = false,
}: {
  value: string
  onChange?: (v: string) => void
  readOnly?: boolean
}) {
  const beforeMount: BeforeMount = (monaco) => {
    // schema-aware(Tier-2);若 worker 未接通,编辑器仍高亮(Tier-1),服务端兜底校验
    import('monaco-yaml')
      .then(({ configureMonacoYaml }) => {
        configureMonacoYaml(monaco, {
          enableSchemaRequest: false,
          schemas: [{ uri: 'inmemory://catalog.json', fileMatch: ['*'], schema: catalogJsonSchema as object }],
        })
      })
      .catch(() => {
        /* Tier-1 fallback:纯 YAML 高亮 */
      })
  }
  const handleChange: OnChange = (v) => onChange?.(v ?? '')
  return (
    <MonacoEditor
      height="60vh"
      language="yaml"
      value={value}
      onChange={handleChange}
      beforeMount={beforeMount}
      options={{ minimap: { enabled: false }, fontSize: 13, readOnly, scrollBeyondLastLine: false }}
    />
  )
}
```
> **worker 接线**:若 `beforeMount` 的 monaco-yaml 因 worker 未配置而在运行时报错,按 Step 2 的 `MonacoEnvironment.getWorker` 在组件模块顶层(`typeof window!=='undefined'` 保护)设置,或在 `app/admin/catalog` 的 client 边界设置。**验证方式见 Step 4**;若 Next 16 下 worker 实在接不通,降级 Tier-1(去掉 monaco-yaml,保留 `language="yaml"` 高亮),记入 references 文档并在报告里说明——**不阻塞后续任务**(服务端才是权威校验)。

- [ ] **Step 4: 手动验证渲染(无独立单测,组件是 UI)**

临时在 `app/admin/catalog/page.tsx`(Task 3 会正式建;此处先建最小版)渲染 `<CatalogEditor value="version: 1\napplications: []" onChange={()=>{}} />`,`pnpm dev` 起,登录进 `/admin/catalog`,确认:编辑器渲染 + YAML 高亮 + 可编辑。schema-aware 若生效,故意写非法结构应有波浪线(非必须)。截图/结论记报告。
Run: `pnpm build`(确认 Monaco/worker 不炸构建)
Expected: build 通过;页面渲染编辑器。

- [ ] **Step 5: 提交**

```bash
git add features/catalog/catalog-editor.tsx package.json pnpm-lock.yaml docs/references/2026-07-07-monaco-yaml-nextjs.md
git commit -m "$(printf 'feat(catalog): Monaco YAML 编辑器组件(monaco-yaml schema-aware + Tier-1 兜底)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: catalog react-query hooks

**Files:**
- Create: `features/catalog/queries.ts`

**Interfaces:**
- Consumes: `apiFetch`(`@/features/shared/api`)。
- Produces: `useCatalog()`、`useApplyCatalog()`、`useCatalogVersions()`、`useCatalogVersion(v)`、`useRollback()`;`catalogKeys`。类型 `CatalogSnapshot={yaml:string;version:number}`、`ApplyResult={version:number;diff:unknown;report:unknown}`、`CatalogVersion={id:string;version:number;appliedBy:string;source:string;appliedAt:string}`。

- [ ] **Step 1: 实现 hooks**

```ts
// features/catalog/queries.ts
'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/features/shared/api'

export type CatalogSnapshot = { yaml: string; version: number }
export type ApplyResult = { version: number; diff: unknown; report: unknown }
export type CatalogVersion = { id: string; version: number; appliedBy: string; source: string; appliedAt: string }

export const catalogKeys = {
  all: ['catalog'] as const,
  current: () => [...catalogKeys.all, 'current'] as const,
  versions: () => [...catalogKeys.all, 'versions'] as const,
  version: (v: number) => [...catalogKeys.all, 'version', v] as const,
}

export function useCatalog() {
  return useQuery({ queryKey: catalogKeys.current(), queryFn: () => apiFetch<CatalogSnapshot>('/api/admin/catalog') })
}

export function useCatalogVersions() {
  return useQuery({
    queryKey: catalogKeys.versions(),
    queryFn: () => apiFetch<{ items: CatalogVersion[] }>('/api/admin/catalog/versions'),
  })
}

export function useCatalogVersion(v: number | null) {
  return useQuery({
    queryKey: catalogKeys.version(v ?? -1),
    queryFn: () => apiFetch<{ version: number; yaml: string; diff: unknown }>(`/api/admin/catalog/versions/${v}`),
    enabled: v !== null,
  })
}

export function useApplyCatalog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { yaml: string; expectedVersion: number }) =>
      apiFetch<ApplyResult>('/api/admin/catalog/apply', { method: 'POST', json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: catalogKeys.all }),
  })
}

export function useRollback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { version: number; expectedVersion: number }) =>
      apiFetch<ApplyResult>('/api/admin/catalog/rollback', { method: 'POST', json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: catalogKeys.all }),
  })
}
```

- [ ] **Step 2: typecheck + 提交**

Run: `pnpm lint`
Expected: 无 error。
```bash
git add features/catalog/queries.ts
git commit -m "$(printf 'feat(catalog): catalog react-query hooks\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: 控制台页 + apply 流程 + i18n + NAV

**Files:**
- Create: `app/admin/catalog/page.tsx`、`features/catalog/catalog-view.tsx`、`messages/en/catalog.json`、`messages/zh-CN/catalog.json`
- Modify: `components/layout/admin-shell.tsx`

**Interfaces:**
- Consumes: `CatalogEditor`(T1)、hooks(T2)、`ApiClientError`(`@/features/shared/api`)、`toast`(sonner)、`useTranslations`。
- Produces: `/admin/catalog` 页;载入 `{yaml,version}` → 编辑 → Apply(带 expectedVersion)→ 成功 diff / 409 重载 / 400 issue 列表。

- [ ] **Step 1: i18n(双语,parity)**

`messages/en/catalog.json`:
```json
{ "catalog": {
  "title": "App Catalog",
  "subtitle": "Declaratively edit the business-app registry (YAML). The server validates on apply.",
  "apply": "Apply", "reload": "Reload", "applying": "Applying…",
  "applied": "Applied — version {version}",
  "conflict": "The catalog was updated by someone else. Reload and retry.",
  "validationTitle": "Validation errors (server)",
  "diffTitle": "Changes applied",
  "nav": "Catalog",
  "versions": { "title": "Version history", "version": "Version", "appliedBy": "By", "source": "Source", "appliedAt": "At", "view": "View", "rollback": "Roll back", "rollbackConfirm": "Roll back to version {version}? This creates a new version.", "empty": "No versions yet" }
} }
```
`messages/zh-CN/catalog.json`(键一一对应,值中文):title「应用目录」、subtitle「以 YAML 声明式编辑业务应用注册表;保存时服务端校验」、apply「应用」、reload「重载」、applying「应用中…」、applied「已应用 —— 版本 {version}」、conflict「目录已被他人更新,请重载后重试」、validationTitle「校验错误(服务端)」、diffTitle「本次变更」、nav「目录」、versions.*(版本历史/版本/操作者/来源/时间/查看/回滚/「回滚到版本 {version}?会生成新版本」/暂无版本)。

- [ ] **Step 2: NAV 加条目**

`components/layout/admin-shell.tsx` 的 `NAV_ITEMS` 在 apps 后加:
```ts
  { href: '/admin/catalog', key: 'catalog', exact: false },
```
并在 admin-shell 的 i18n(`auth` 或 nav 用的 namespace)加 `catalog` 标签键——按现有 NAV label 读取方式(查 admin-shell 现有 key 如何翻译,同法加)。

- [ ] **Step 3: server page**

```tsx
// app/admin/catalog/page.tsx
import { getTranslations } from 'next-intl/server'
import { CatalogView } from '@/features/catalog/catalog-view'

export default async function CatalogPage() {
  const t = await getTranslations('catalog')
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <CatalogView />
    </div>
  )
}
```

- [ ] **Step 4: client view + apply 流程**

```tsx
// features/catalog/catalog-view.tsx
'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ApiClientError } from '@/features/shared/api'
import { CatalogEditor } from './catalog-editor'
import { useApplyCatalog, useCatalog } from './queries'

type Issue = { path: string; message: string }

export function CatalogView() {
  const t = useTranslations('catalog')
  const { data, isPending, refetch } = useCatalog()
  const apply = useApplyCatalog()
  const [yaml, setYaml] = useState('')
  const [version, setVersion] = useState(0)
  const [issues, setIssues] = useState<Issue[]>([])
  const [diff, setDiff] = useState<unknown>(null)

  useEffect(() => {
    if (data) { setYaml(data.yaml); setVersion(data.version) }
  }, [data])

  const onApply = () => {
    setIssues([]); setDiff(null)
    apply.mutate(
      { yaml, expectedVersion: version },
      {
        onSuccess: (r) => {
          setVersion(r.version); setDiff(r.diff)
          toast.success(t('applied', { version: r.version }))
        },
        onError: (e) => {
          if (e instanceof ApiClientError && e.code === 'CONFLICT') {
            toast.error(t('conflict'))
          } else if (e instanceof ApiClientError && e.code === 'VALIDATION_ERROR') {
            const list = (e.details?.issues as Issue[]) ?? []
            setIssues(list)
            toast.error(t('validationTitle'))
          } else {
            toast.error(e instanceof Error ? e.message : String(e))
          }
        },
      },
    )
  }

  if (isPending) return <div className="h-[60vh] animate-pulse rounded bg-muted" />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button onClick={onApply} disabled={apply.isPending}>
          {apply.isPending ? t('applying') : t('apply')}
        </Button>
        <Button variant="outline" onClick={() => refetch()}>{t('reload')}</Button>
        <span className="text-xs text-muted-foreground">v{version}</span>
      </div>
      <CatalogEditor value={yaml} onChange={setYaml} />
      {issues.length > 0 && (
        <Card className="border-danger p-3">
          <p className="mb-1 text-sm font-medium text-danger">{t('validationTitle')}</p>
          <ul className="text-sm text-danger">
            {issues.map((i, k) => <li key={k}><code>{i.path}</code>: {i.message}</li>)}
          </ul>
        </Card>
      )}
      {diff != null && (
        <Card className="p-3">
          <p className="mb-1 text-sm font-medium">{t('diffTitle')}</p>
          <pre className="overflow-x-auto text-xs">{JSON.stringify(diff, null, 2)}</pre>
        </Card>
      )}
    </div>
  )
}
```
> 若 `Card`/`danger` 类名与仓库实际不符,按现有组件/主题变量调整(查 `components/ui/card.tsx` 与 `app/globals.css` 的 danger 变量)。

- [ ] **Step 5: 跑起来 + lint + 提交**

Run: `pnpm lint` + `pnpm dev` 手验:进 `/admin/catalog` → 编辑器载入当前 YAML → 改一处 → Apply → 成功 toast + diff;故意写坏 YAML → issue 列表。
```bash
git add app/admin/catalog features/catalog/catalog-view.tsx messages/en/catalog.json messages/zh-CN/catalog.json components/layout/admin-shell.tsx
git commit -m "$(printf 'feat(catalog): 控制台页 + apply 流程 + i18n + NAV\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4: 版本历史 + 回滚 UI

**Files:**
- Create: `features/catalog/version-history.tsx`
- Modify: `features/catalog/catalog-view.tsx`(挂入)

**Interfaces:**
- Consumes: `useCatalogVersions`/`useCatalogVersion`/`useRollback`(T2)、`AlertDialog`(`@/components/ui/alert-dialog`)、`Table`。

- [ ] **Step 1: 实现版本历史组件**

`version-history.tsx`:表格列 version/appliedBy/source/appliedAt + 「查看」(拉 `useCatalogVersion` 只读展示 yaml/diff)+「回滚」(`AlertDialog` 确认 → `useRollback.mutate({version, expectedVersion})` → onSuccess toast + invalidate;onError 同 CONFLICT/其它处理)。空态 `versions.empty`。用 `useTranslations('catalog')` 的 `versions.*` 键。渲染用现有 `Table` 组件 + `useFormatter().dateTime(new Date(appliedAt), {dateStyle:'medium', timeStyle:'short'})`。

- [ ] **Step 2: 挂进 catalog-view**

在 `catalog-view.tsx` 编辑器下方加 `<VersionHistory currentVersion={version} onRolledBack={(v)=>{setVersion(v); refetch()}} />`(回滚后同步 version + 重载编辑器)。

- [ ] **Step 3: lint + 手验 + 提交**

Run: `pnpm lint` + `pnpm dev` 手验:apply 两次 → 版本历史出现两条 → 查看旧版 → 回滚 → 新版本 + 编辑器内容回到旧 yaml。
```bash
git add features/catalog/version-history.tsx features/catalog/catalog-view.tsx
git commit -m "$(printf 'feat(catalog): 版本历史 + 回滚 UI\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 5: apps 管理页定义只读化

**Files:**
- Modify: `features/apps/apps-view.tsx`、`features/apps/app-detail-view.tsx`(+ 相关 form/dialog/hook)、`messages/{en,zh-CN}/apps.json`

**Interfaces:**
- Produces: apps 列表无「登记应用」创建入口(换目录提示);detail 的 basic/keycloak/roles tab 只读;保留 assignments/roleAssignments/sync tab。

- [ ] **Step 1: 列出要删/改的组件**

先 `rg "useCreateApplication|useUpdateApplication|createRole|updateRole|app-form" features/apps` 摸清创建/编辑 UI 与 hook。列清单(哪些删、哪些改只读)写报告。

- [ ] **Step 2: 列表页**

`apps-view.tsx`:移除「登记应用」按钮 + 创建 `Dialog`(POST /applications 已 409)。在标题区加提示条(用 `apps` namespace 新键 `catalogManaged`,双语):「应用由目录管理」+ `<Link href="/admin/catalog">` 去编辑。相关 mutation import 一并删。

- [ ] **Step 3: 详情页定义 tab 只读**

`app-detail-view.tsx`:`basic`/`keycloak`/`roles` tab 去掉编辑表单/PATCH/创建角色动作,改为只读展示字段值 + 「去目录编辑」链接。**保留** `assignments`/`roleAssignments`/`sync` tab 及其命令式逻辑不动。删除仅这三个定义 tab 用到的 form/dialog 组件与 hook。

- [ ] **Step 4: lint + 全量测试 + 手验 + 提交**

Run: `pnpm lint` + `pnpm test` + `pnpm test:integration`
Expected: 无回归(旧 apps 写测试若有,更新为断言只读/CATALOG_MANAGED;assignments 测试仍过)。手验 apps 页无创建入口、定义只读、授权 tab 正常。
```bash
git add features/apps messages/en/apps.json messages/zh-CN/apps.json
git commit -m "$(printf 'refactor(apps): 应用/角色定义改由目录管理(定义 tab 只读)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 6: e2e + 全量验证 + docpact + PR

**Files:**
- Create: `tests/e2e/catalog-console.spec.ts`

- [ ] **Step 1: e2e**

```ts
// tests/e2e/catalog-console.spec.ts
import { expect, test } from '@playwright/test'

test('目录控制台:载入 → 编辑 → Apply → 版本历史', async ({ page }) => {
  await page.goto('/admin/catalog')
  await expect(page.getByRole('heading', { name: /应用目录|App Catalog/ })).toBeVisible()
  // 编辑器载入(Monaco 渲染 .monaco-editor)
  await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 20_000 })
  // Apply(不改内容也可,幂等;或改 name)
  await page.getByRole('button', { name: /^应用$|^Apply$/ }).click()
  // 成功 toast 或 diff 卡出现(二者其一)
  await expect(page.getByText(/已应用|Applied|本次变更|Changes applied/).first()).toBeVisible({ timeout: 15_000 })
})
```
> Monaco 内容编辑在 e2e 里较脆(contenteditable);若直接改文本不稳,e2e 只验「页面 + 编辑器渲染 + Apply 按钮可点 + 结果反馈」,更细的编辑逻辑靠手验 + 组件层。

- [ ] **Step 2: 全量验证**

Run: `pnpm test && pnpm test:integration && pnpm lint`(+ `pnpm build` 确认 Monaco 不炸生产构建)
Expected: 全绿(仅已知 flake 允许)。e2e `pnpm test:e2e`(需 dev server;按 playwright config 自起)。

- [ ] **Step 3: docpact**

Run(workspace 根):`scripts/docpact lint --root identity-center --merge-base origin/main`
触发:`identity-portal-ui-contract`(app/**、components/**、features/**、messages/** → AGENTS.md、frontend-interaction-design)、`identity-api-contract`(P2a 的 app/api,若同分支)。review/更新 + `docpact review mark --commit <SHA>`。
Expected: exit 0。

- [ ] **Step 4: PR(合并 P2a + P2b)**

```bash
git push -u origin feat/catalog-console
gh pr create --base main --title "feat(catalog): 目录管理控制台 P2(API + Monaco 控制台 + 禁旧端点)" --body "$(cat <<'BODY'
P2 目录管理控制台(全):
- P2a 后端:catalog HTTP API + catalog:read/apply 权限 + catalogJsonSchema + 禁旧命令式写端点(CATALOG_MANAGED)。
- P2b 前端:/admin/catalog Monaco YAML 编辑器(kubectl-edit:载入→编辑→Apply→diff/错误/冲突重载)+ 版本历史/回滚 + apps 定义页只读化。

设计:docs/implementation/plans/2026-07-07-catalog-console-p2-design.md
计划:...-p2a-backend.md / ...-p2b-frontend.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```
> 若 P2a 已单独开过 PR,则本 PR 即在同分支上补 P2b 提交(PR 自动更新);无需再开新 PR。

---

## Self-Review(对照 spec)

- **覆盖:** §5.5 控制台页→T1/T3;编辑器 Monaco→T1;hooks→T2;apply/冲突/校验流→T3;§6 版本/回滚→T4;§5.6 apps 只读→T5;§5.7 i18n→T3(+T5);§8 e2e→T6。§5.1-5.4(API/权限/schema/禁端点)在 **P2a**。
- **类型一致:** `CatalogEditor`(T1)用于 T3;hooks/类型(T2)用于 T3/T4;`ApiClientError.code`(CONFLICT/VALIDATION_ERROR)驱动 T3/T4 错误分支。
- **风险:** Monaco worker(T1)有 Tier-1 兜底 + 明确「接不通就降级并记录,不阻塞」;e2e Monaco 编辑脆→只验渲染+Apply+反馈。
- **无占位符:** 关键代码给全;apps 只读化(T5)因现有组件多,给了「先 rg 摸清单再删改」的具体方法而非逐行(实现时按清单执行)。

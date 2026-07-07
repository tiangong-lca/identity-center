# 目录管理控制台(P2)设计

> **状态:** Draft(brainstorming 产出,待评审;评审通过后由 superpowers:writing-plans 切分实现计划)
> **日期:** 2026-07-07
> **仓库:** identity-center(功能全部落在本仓);分支 `feat/catalog-console`(从 origin/main `a97dddd`)
> **前置:** P1 后端已合(PR #9)。`createCatalogService(ctx)` 暴露 `getCurrent`/`apply`/`listVersions`/`getVersion`/`rollback`,`apply` 的 `source` 联合已含 `'console'`,乐观并发 + 审计已内建。
> **关联:** 总体设计 [`2026-07-06-declarative-app-catalog-design.md`](./2026-07-06-declarative-app-catalog-design.md)(§7.5 控制台、§8 API、D5-D7);P1 计划 [`2026-07-06-declarative-app-catalog-p1.md`](./2026-07-06-declarative-app-catalog-p1.md)。

---

## 1. 背景与目标

P1 交付了声明式目录后端(YAML → 事务物化 + 版本 + KC 准入 reconcile + 审计),目前只能经 CLI(`apply-catalog`)操作。P2 交付**管理控制台**,让管理员在浏览器里以 **kubectl-edit 范式**编辑目录:载入当前 `{yaml, version}` → 编辑 → Apply(带 `expectedVersion` 乐观并发)→ 看 diff/错误 → 版本历史 + 回滚。

同时把目录变成 app/角色**定义**的**唯一编辑路径**:禁用旧的命令式写端点,apps 管理页的定义编辑改只读(与 P1「统一」决策一致,消除双写漂移)。

---

## 2. 范围与非目标

### 范围
- 5 个 catalog HTTP 端点(包 `createCatalogService`)。
- 新权限 `catalog:read` + `catalog:apply`。
- `lib/catalog/schema.ts` 导出 JSON-schema(喂 Monaco)。
- `/admin/catalog` 控制台页:Monaco YAML 编辑器 + apply(diff/错误)+ 版本历史 + 回滚。
- 禁用旧命令式写端点(app/角色**定义**);apps 管理页定义 tab 改只读。

### 非目标
- 不改 P1 后端服务逻辑(catalog-service 已就绪,只包 HTTP)。
- **不动**用户授权/角色分配路径(assignments / role-assignments,权限 `app:assign`/`app:revoke`,命令式不变)——目录只管「定义」,不管「谁被授予」。
- 不做 export/import UI(P3/后续)、不做周期对账 job(P3)。
- 不引入服务端渲染的编辑器(Monaco 走 client-only dynamic import)。

---

## 3. 关键决策(brainstorm 定,含理由)

| # | 决策 | 理由 |
|---|---|---|
| **D-E** | 编辑器 = **Monaco + monaco-yaml** | 最强 schema-aware(内联结构校验 + 自动补全,用 zod→JSON-schema);内部 admin 工具,包体重量可接受。服务端 apply 仍是唯一权威校验器。 |
| **D-P** | 权限 = **新增 `catalog:read` + `catalog:apply`** | 单一概念清晰;目录横跨 app+角色定义,复用 `app:update`+`role:manage` 一端点多权限较绕。加进 seed 的 `PERMISSIONS` + `app_admin` 角色。 |
| **D-S** | 范围 = **禁旧写端点 + apps 定义页只读**(单一编辑路径)| 与 P1「统一 seed」一致,消除双写漂移(apps PATCH 改的会被下次 catalog apply 回滚)。授权/分配 tab 保留命令式。 |
| **D-C** | 并发冲突 UX = CONFLICT → 提示重载 | 乐观并发(`expectedVersion`)= k8s resourceVersion;冲突让管理员重载最新再改。 |

---

## 4. 架构与数据流

控制台是 P1 后端的**薄 HTTP + UI 壳**。所有写语义(事务、乐观并发、reconcile、审计)已在 `catalog-service`,P2 不重复。

**数据流(编辑保存):** 页面载入 `GET /catalog` → `{yaml, version}` 进 Monaco(version 记于 state)→ 管理员编辑 → Apply → `POST /catalog/apply {yaml, expectedVersion:version}` → 服务端 `apply({…, source:'console'})`:
- 成功 → `{version, diff, report}`:toast + 展示 diff 报告 + 更新 state.version + invalidate 版本列表。
- 409 CONFLICT(version 过期)→ toast「目录已被他人更新,请重载」+ 重载按钮。
- 400 VALIDATION_ERROR(YAML 语法/schema/唯一性)→ 展示 `details.issues[]`(path + message),**编辑器保留内容**(kubectl-edit 语义)。

**数据流(回滚):** 版本历史 `GET /catalog/versions` → 选某版 `GET /catalog/versions/[v]` 只读看 yaml/diff → 回滚(确认框)→ `POST /catalog/rollback {version:v, expectedVersion}` → 产生新版本。

---

## 5. 组件

### 5.1 API 端点 `app/api/admin/catalog/**`(单一职责:包 service)
沿用 `adminRoute({permission}, handler)` + `parseBody(request, zodSchema)` + `ok(data, requestId, status)` 信封(`app/api/_helpers.ts`)。

| 文件 | 方法 & 权限 | 处理 |
|---|---|---|
| `catalog/route.ts` | `GET` `catalog:read` | `ok(await createCatalogService(ctx).getCurrent())` → `{yaml, version}` |
| `catalog/apply/route.ts` | `POST` `catalog:apply` | `parseBody` `{yaml: string, expectedVersion?: number}` → `apply({yaml, expectedVersion, source:'console'})` → `{version, diff, report}` |
| `catalog/versions/route.ts` | `GET` `catalog:read` | `listVersions()` → `{items: […]}` |
| `catalog/versions/[version]/route.ts` | `GET` `catalog:read` | `getVersion(Number(params.version))`;undefined → `ApiError('NOT_FOUND')` |
| `catalog/rollback/route.ts` | `POST` `catalog:apply` | `parseBody` `{version: number, expectedVersion?: number}` → `rollback(...)` |

- CONFLICT/NOT_FOUND/VALIDATION_ERROR 由 service 抛的 `ApiError` 经 `failFromUnknown` 映射(CONFLICT=409、NOT_FOUND=404、VALIDATION_ERROR=400 带 `details.issues`)。
- apply/rollback 是写操作 → 自动走 `adminRoute` 的 CSRF + 限流 + 幂等 + 审计上下文。

### 5.2 权限 `scripts/seed/admin-rbac.ts`
- `PERMISSIONS` 加 `{ code:'catalog:read', name:'查看目录' }`、`{ code:'catalog:apply', name:'应用目录' }`。
- `ROLE_PERMISSION_MAP.app_admin` 加 `'catalog:read'`、`'catalog:apply'`。`auditor` 经 `ALL_READ`(`:read` 结尾)自动得 `catalog:read`。
- seed 幂等重跑生效(现有部署需重跑 `pnpm db:seed`)。

### 5.3 JSON-schema 导出 `lib/catalog/schema.ts`
- 加 `export const catalogJsonSchema = z.toJSONSchema(catalogDocSchema)`(zod v4 原生)。
- **注意:** `catalogDocSchema` 顶层用 `.superRefine`(唯一性),`z.toJSONSchema` 会忽略它 → Monaco 只做**结构**级校验/补全;**唯一性 + `${ENV}`/业务校验由服务端 apply 兜底**(不因为 Monaco 通过就放行)。

### 5.4 禁用旧写端点
- `ERROR_CODES`(`lib/http/error-codes.ts`)加 `CATALOG_MANAGED: 409`。
- 下列 handler 首行改为抛 `throw new ApiError('CATALOG_MANAGED', '应用/角色定义由目录管理,请用目录编辑器 /admin/catalog')`:
  - `POST /api/admin/applications`(`app:create`)
  - `PATCH /api/admin/applications/[id]`(`app:update`)
  - `POST /api/admin/applications/[id]/roles`(`role:manage`)
  - `PATCH /api/admin/applications/[id]/roles/[roleId]`(`role:manage`)
- **保留不动:** 所有 `GET`;assignments / role-assignments 的 `POST`/`DELETE`(`app:assign`/`app:revoke`);sync 相关。

### 5.5 控制台页 `app/admin/catalog/` + `features/catalog/`
沿用「thin server component page → `'use client'` view + react-query + Sonner」范式。
- `app/admin/catalog/page.tsx` — server component,`getTranslations('catalog')` + 渲染 `<CatalogView/>`。
- `features/catalog/catalog-view.tsx`('use client')— 布局:Monaco 编辑器(主)+ 工具条(Apply / 重载)+ 版本历史(侧栏或抽屉)+ 结果区(成功=diff 报告;失败=校验 issue 列表)。
- `features/catalog/catalog-editor.tsx` — `dynamic(() => import(...), { ssr:false })` 包 `@monaco-editor/react` + `monaco-yaml`,用 `catalogJsonSchema` 配 schema。**⚠️ Monaco worker 在 Next.js 16 的接线是已知细节(见 §9 风险)。**
- `features/catalog/queries.ts` — `useCatalog`(GET)、`useApplyCatalog`(POST apply)、`useCatalogVersions`(GET versions)、`useCatalogVersion(v)`、`useRollback`;用 `apiFetch` + `queryClient.invalidateQueries`;Sonner toast。
- `components/layout/admin-shell.tsx` 的 `NAV_ITEMS` 加 `{ href:'/admin/catalog', key:'catalog', exact:false }`(放在 apps 后)。

### 5.6 apps 管理页只读化 `features/apps/`
- **列表页**(`apps-view.tsx`):移除「登记应用」创建弹窗(POST /applications 已禁)→ 换成提示条「应用由目录管理」+ 链到 `/admin/catalog`。
- **详情页**(`app-detail-view.tsx`):`basic` / `keycloak` / `roles`(定义)tab 去掉编辑表单/PATCH/创建角色动作,改为只读展示 + 「去目录编辑」链接。**保留** `assignments` / `roleAssignments` / `sync` tab(命令式授权,不变)。
- 相关 mutation hook(`useCreateApplication`/`useUpdateApplication`/角色写)+ 表单组件(`app-form-dialogs.tsx` 等)按需删除/改只读。

### 5.7 i18n
- 新增 `messages/en/catalog.json` + `messages/zh-CN/catalog.json`(namespace `catalog`):页标题/副标题、编辑器标签、Apply/重载/回滚、错误文案(冲突/校验)、版本历史列(version/appliedBy/source/appliedAt)、diff 标签。
- 更新 `apps.json`(双语)的只读提示文案。
- **parity 测试**(`tests/unit/messages-parity.test.ts`)要求 en/zh-CN 键齐。

---

## 6. 行为细则

- **乐观并发:** 页面持有载入时的 `version`;apply/rollback 带 `expectedVersion=version`;服务端 `max(version)≠expectedVersion` → 409。前端提示重载(重载后 version 更新)。
- **校验分层:** Monaco 结构级(即时,非权威)→ 服务端 apply 语法+schema+唯一性(权威,返回 `details.issues[]`)。前端把 issue 的 `path` 尽量映射到编辑器行(能力允许时),否则列表展示。
- **diff 报告:** 成功后展示 `diff`(created/updated/pendingDeactivate + roles.*)+ `report`(ensured/clientMissing/errors)——让管理员看到本次变更 + KC 投影结果。
- **回滚:** 只读预览历史版本 → 确认框 → rollback(带 expectedVersion)→ 新版本 + toast。

---

## 7. 错误处理

| 来源 | 码 | 前端处理 |
|---|---|---|
| version 过期 | 409 CONFLICT | toast + 重载按钮(保留编辑内容,让用户决定是否覆盖重编)|
| YAML/schema/唯一性 | 400 VALIDATION_ERROR(`details.issues`)| 列 issue(path+message),编辑器保留内容 |
| 回滚目标不存在 | 404 NOT_FOUND | toast |
| 旧写端点被调用 | 409 CATALOG_MANAGED | 提示改用目录编辑器 |
| KC 部分失败 | apply 成功(report.errors/clientMissing 非空)| diff 报告里高亮告警(非阻塞,DB 已提交)|

`apiFetch` 抛 `ApiClientError(code, message, status, details)`;view 按 `code` 分支处理。

---

## 8. 测试

- **集成**(`tests/integration/`,import handler + `NextRequest` + mock `@/lib/auth`,真实 PG+KC,复用 `api-contract.test.ts` 那套):
  - catalog 5 端点:GET 返回 `{yaml, version}`;apply 成功/CONFLICT(过期 version)/VALIDATION(坏 YAML,`details.issues`);versions 列表/单版;rollback 产生新版本 + NOT_FOUND。
  - 权限:无 `catalog:read`/`catalog:apply` → 403;有 → 通过。
  - 禁旧端点:POST /applications、PATCH /applications/[id]、roles POST/PATCH → 409 `CATALOG_MANAGED`;GET/assignments 仍 200。
- **单元**(`tests/unit/`):`catalogJsonSchema` 导出(结构正确、含 applications/roles 字段)。
- **e2e**(`tests/e2e/`,playwright,双语选择器,预置 admin auth):`/admin/catalog` 载入 → 编辑器可见 → 改 YAML → Apply → 成功/diff → 版本历史 → 回滚。apps 页只读(无「登记应用」按钮 or 点了提示目录管理)。
- 遵循 `docs/implementation/definition-of-done.md`。

---

## 9. 风险 / 开放问题

1. **Monaco worker 在 Next.js 16 的接线**(最大风险):`monaco-yaml` 需要配置 monaco 的 web worker(`MonacoEnvironment.getWorker` / webpack `MonacoWebpackPlugin` 或 `@monaco-editor/react` 的 loader)。Next 16(App Router + Turbopack/webpack)下的正确接法要在 **writing-plans 阶段用 Context7 核实**(`monaco-yaml` + `@monaco-editor/react` + Next.js 官方/文档),必要时先做一个最小 spike。若接线成本过高,退路:CodeMirror 6 或 Textarea(但已定 Monaco;退路仅作风险兜底)。
2. **issue path → 编辑器行映射**:服务端 `details.issues[].path` 是 zod 路径(如 `applications.0.code`),映射到 YAML 行需要额外解析。P2 先做**列表展示**(path+message);行内标注作为增强(可 P2 后期或降级)。
3. **apps 只读化的删改面**:`features/apps/` 现有创建/编辑组件较多,只读化要小心不误删授权 tab 的逻辑。plan 阶段先列清哪些组件/hook 删、哪些改只读。
4. **JSON-schema 与 superRefine 差距**:Monaco 不校验唯一性/`${ENV}`,可能让用户以为「编辑器没报错=能保存」;服务端会拒。UX 上在结果区明确「服务端才是最终校验」。

---

## 10. 建议分期(供 writing-plans 切)

- **P2.1** — 权限(seed)+ 5 个 catalog API 端点 + `catalogJsonSchema` 导出 + 集成测。
- **P2.2** — 禁用旧写端点(+ `CATALOG_MANAGED`)+ 集成测。
- **P2.3** — 控制台页骨架:`/admin/catalog` + Monaco 编辑器接线(先解决 worker)+ GET 载入 + Apply(diff/错误)+ hooks + i18n + NAV。
- **P2.4** — 版本历史 + 回滚 UI。
- **P2.5** — apps 管理页只读化。
- **P2.6** — e2e + 验收 + docpact 对齐。

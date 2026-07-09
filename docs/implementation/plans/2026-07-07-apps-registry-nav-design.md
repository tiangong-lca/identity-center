# Admin 导航重构:目录 → 应用注册表(收进「应用」)— 设计

> P2/P3 后续 UX/IA 微调。纯前端 + i18n,后端/API 一律不动。

## 1. 背景与问题

P2/P3 把声明式目录做成了侧边栏顶级项「目录」(`/admin/catalog`),与「应用」(`/admin/apps`)**并列**。但二者是**同一域(业务应用)的两个视角**:

- **应用** `/admin/apps` — 应用列表 + 每应用的分配/角色/同步(运营视图;定义在 P2 后已只读)。
- **目录** `/admin/catalog` — 声明式 YAML 定义源 + 版本历史 + 待停用(定义/配置源视图)。

并列在顶层看不出从属关系;且「目录」在中文里近似「列表/清单」,与「应用列表」概念撞车。

## 2. 决策

- **收拢**:「目录」并入「应用」之下,不再是顶级项。
- **改名**:目录 → **应用注册表(Application Registry)**。registry = 已登记应用的权威记录,贴合声明式定义源,且与「应用列表」区分。
- **呈现**:「应用」区顶部**段内标签页** `[应用列表 | 应用注册表]`(路由驱动,可深链)。

```
应用 (Applications)                 [侧边栏顶级项,保留]
  ├─ [应用列表]   /admin/apps            现有列表 + 分配/角色/同步(含 /admin/apps/[id] 详情)
  └─ [应用注册表] /admin/apps/registry   现 /admin/catalog 的 CatalogView(原样复用)
```

## 3. 改动清单(全部在 identity-portal)

1. `components/layout/admin-shell.tsx` — 从 `NAV_ITEMS` 删除 `{ href: '/admin/catalog', key: 'catalog' }`;`apps` 保留。
2. 新建段内 tab bar 组件 `features/apps/apps-section-tabs.tsx`('use client'):两个链接 `应用列表 → /admin/apps`、`应用注册表 → /admin/apps/registry`,按 `usePathname` 高亮(registry 精确匹配 `/admin/apps/registry`;应用列表匹配 `/admin/apps` 与其它非 registry 子路径)。
3. `app/admin/apps/page.tsx` — 页顶渲染 `<AppsSectionTabs/>`(其余不变)。
4. 新建 `app/admin/apps/registry/page.tsx`(thin server component):`getTranslations` + `<AppsSectionTabs/>` + 复用 `CatalogView`(从 `@/features/catalog/catalog-view`,内部零改动)。
5. `app/admin/catalog/page.tsx` — 改为 `import { redirect } from 'next/navigation'; export default function CatalogRedirect() { redirect('/admin/apps/registry') }`(保住 P3 刚上线的旧链接不 404)。
6. i18n(`messages/{en,zh-CN}/core.json`):
   - `nav` 删除 `catalog` 键。
   - 新增 tab 标签 —— 放 `nav` 同层或新增 `appsTabs` 命名空间:`list`(应用列表 / Application list)+ `registry`(应用注册表 / Registry)。en/zh 键集对齐(parity 测试)。
7. e2e:`tests/e2e/catalog-console.spec.ts` 与 `tests/e2e/catalog-pending-deactivate.spec.ts` 中 `page.goto('/admin/catalog')` → `/admin/apps/registry`;若断言依赖 nav「目录」文案,改为对应 tab 文案。

## 4. 完全不动

所有 `/api/admin/catalog/*` 端点、`features/catalog/queries.ts` hooks(仍指向 `/api/admin/catalog/*`)、`catalog-service`、materialize、待停用/版本/回滚/明文扫描逻辑。仅 UI 挪位置 + 换名;`CatalogView` 组件内部零改动(只是被新路由渲染)。

`app/admin/catalog` 页面标题文案(`catalog.title`/`subtitle`)若仍写「目录」,顺带在 registry 页沿用或微调为「应用注册表」——非必需,视觉一致即可(登记在开放问题)。

## 5. 测试与验证

- `pnpm typecheck` · `pnpm lint`(注意 registry page 是 server component,tab bar 是 client)· `pnpm build`。
- i18n parity 测试(core.json en/zh 键集一致)。
- e2e:`catalog-console` + `catalog-pending-deactivate` 走新路由通过;顺带冒烟 `/admin/catalog` → 302 → `/admin/apps/registry`。

## 6. 非目标 / 约束

- 不改任何后端/API/service/测试逻辑(除 e2e 路由字符串)。
- 不动 `CatalogView` 内部(待停用面板、版本历史、Monaco 编辑器)。
- 不引入侧边栏分组/折叠逻辑(段内 tab 方案,侧边栏组件仅删一项)。
- Tab 标签用「应用列表 / 应用注册表」(与「应用」父级略重复,已确认接受)。

## 7. 开放问题

1. registry 页内 `CatalogView` 顶部标题文案是否从「应用目录」改为「应用注册表」以求一致(倾向改,低风险)。
2. `/admin/catalog` 用 302 重定向(本设计选)还是直接删除路由(YAGNI,但会 404 旧链接)——选重定向。

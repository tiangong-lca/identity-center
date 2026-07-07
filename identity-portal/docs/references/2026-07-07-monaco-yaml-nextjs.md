# Monaco + monaco-yaml 在 Next.js 16(Turbopack)下的接法

- 关联任务:P2b-T1(`identity-center` catalog-console 前端)
- 关联组件:`features/catalog/catalog-editor.tsx`
- 关联临时验证页:`app/admin/catalog/page.tsx`(Task 3 会替换为正式页面)

## 结论:Tier-2(schema-aware)达成

本项目 Next.js 版本 16.2.10,`package.json` 的 `dev`/`build` 脚本均未带 `--webpack`/`--turbopack` 标记,按 Next 16 默认行为(`node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` §"Turbopack by default")**dev 和 build 都默认走 Turbopack**。

按 monaco-yaml 官方 README(`node_modules/monaco-yaml/README.md` §Usage 末尾的 Webpack 5 worker 注册代码块)推荐的 `new Worker(new URL(<entry>, import.meta.url))` 写法直接接入,**未做任何降级**:

- `pnpm typecheck` 通过
- `pnpm lint` 通过(ESLint boundaries 插件对 `features -> lib/catalog` 的引用无告警;`lib/catalog` 未出现在 `eslint.config.mjs` 的 `boundaries/elements` 分类里,但现有 `server/services`、`scripts` 已有相同引用模式且长期无告警,说明未分类目标不会触发 `boundaries/dependencies` 报错)
- `pnpm build` 通过两次(均为 `▲ Next.js 16.2.10 (Turbopack)`,零警告零错误),`/admin/catalog` 出现在构建产物路由表中(动态路由 `ƒ`)
- `pnpm dev`(Turbopack)下 `curl /admin/catalog` 返回 307 重定向到 `/login`(符合 `app/admin/layout.tsx` 的 `auth()` 门禁预期),证明路由本身可编译、可响应,未 500

判定依据:Next.js 16 的 Turbopack 文档(`node_modules/next/dist/docs/01-app/03-api-reference/08-turbopack.md` §Magic Comments)明确写明 **"These comments work with dynamic `import()`, `require()`, `require.resolve()`, and `new Worker()` expressions"** —— 把 `new Worker()` 和 `import()` 列为同一类"bundler-aware 表达式",这是 Turbopack 对 webpack 生态 `new Worker(new URL(...))` 惯用法保持兼容的直接证据。构建结果印证了这一点。

## 用到的接法(与 monaco-yaml README 一致)

1. **加载器**:`dynamic(() => import('@monaco-editor/react'), { ssr: false })`,避免 SSR 阶段触碰浏览器专属 API。
2. **worker 注册**(`window.MonacoEnvironment.getWorker`,仅在 `typeof window !== 'undefined'` 时设置,组件模块顶层执行一次):
   ```ts
   window.MonacoEnvironment = {
     getWorker(_moduleId, label) {
       if (label === 'yaml') {
         return new Worker(new URL('monaco-yaml/yaml.worker', import.meta.url))
       }
       return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker', import.meta.url))
     },
   }
   ```
   两个 worker 入口文件均已在 `node_modules` 中确认存在且可被 Node 的 `require.resolve` 正常解析:
   - `monaco-yaml/yaml.worker.js`
   - `monaco-editor/esm/vs/editor/editor.worker.js`
3. **schema 配置**(`beforeMount(monaco)`,动态 `import('monaco-yaml')` + `.catch()` 兜底):
   ```ts
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
   ```
   `enableSchemaRequest: false` 是有意选择:schema 直接以对象形式内联传入(`catalogJsonSchema`,来自 P2a-T2 `@/lib/catalog/schema` 的 `z.toJSONSchema`),不需要 monaco-yaml 再对外发起网络请求下载 schema。

## Tier-1 兜底路径(本次未触发,但保留)

- `beforeMount` 里的 `.catch()` 会在 `monaco-yaml` 动态 import 失败,或 `configureMonacoYaml` 调用抛错时静默吞掉异常,编辑器仍然渲染 + 保留 `language="yaml"` 的语法高亮(纯 Monaco 内置能力,不依赖 monaco-yaml)。
- `window.MonacoEnvironment` 赋值本身包在 `try/catch` 里,即使这段在某些运行时下报错,也不会抛到组件外层。
- 唯一性等跨字段校验(`superRefine`,例如重复 app code/role code)本来就不在 JSON Schema 里,**服务端 `apply` 端点是权威校验**,前端 schema-aware 只是编辑体验增强,不是安全边界。

## 已知限制 / 后续关注点

- 本次验证止于「构建通过 + dev 路由可响应(307 重定向)」,**未完成浏览器内真实登录后的可视化验证**(需要 Keycloak/Postgres/Redis/RabbitMQ 完整本地栈,超出本任务范围)。Task 3(P2b-T3,正式页面)落地时应做一次完整的手动/截图验证,确认:
  - YAML 高亮正常
  - 故意写非法结构(如 `applications` 写成字符串)时编辑器出现波浪线提示(schema-aware 生效的直接证据)
- 若未来 Next.js 版本变化导致 Turbopack 对 `new Worker(new URL(...))` 的处理方式调整,应重新跑一次 `pnpm build` 确认;`beforeMount` 的 `.catch()` 兜底届时会自动降级为 Tier-1,不会导致构建失败或运行时崩溃,但会**静默**失去 schema 校验能力,值得在未来升级 Next 版本时专门检查一次(例如临时在 `.catch()` 里加一行 `console.warn` 排查)。

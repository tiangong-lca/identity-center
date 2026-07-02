# L0 依赖版本查证记录(2026-07-02)

按 GOAL §5.1"先查证后实现"执行的版本调研结论与实际安装版本。后续各层引入新库时在 `docs/references/` 追加同类记录。

## 查证结论

| 依赖 | 当前状态(查证于 2026-07-02) | 决策 |
|---|---|---|
| Next.js | 16.2.x 为 Active LTS(16 于 2025-10 发布:Turbopack 默认、Node ≥20、**`middleware.ts` 更名 `proxy.ts`**) | 采用 16.2.x;后续层写 proxy/中间件逻辑前先读 `node_modules/next/dist/docs/`(create-next-app 生成的 AGENTS.md 明确警告与旧知识有破坏性差异) |
| next-intl | v4 现行;App Router 支持"[locale] 路由前缀"与"无路由前缀"两种模式 | **选无路由前缀模式**(cookie `NEXT_LOCALE`):管理门户登录后使用、无 SEO 需求,URL 干净、全部页面免套 `[locale]` 段 |
| next-themes | 0.4.x | class 模式 + Tailwind v4 dark 变体 |
| Tailwind CSS | v4(create-next-app 默认集成,@tailwindcss/postcss) | CSS-first 配置,设计库 token 以 CSS 变量接入 |
| Vitest | 4.1.x 稳定线(5.0 尚在 beta) | 锁 4.x |
| Keycloak | 26.5.x 现行(26.5.0 2026-01 发布;镜像 quay.io/keycloak/keycloak) | 镜像 `quay.io/keycloak/keycloak:26.5`;KC 26 用 `KC_BOOTSTRAP_ADMIN_USERNAME/PASSWORD`;健康检查在管理端口 9000 `/health/ready` |
| @keycloak/keycloak-admin-client | 26.6.x(与 KC 26 兼容) | 采用 |
| KingbaseES Docker | **无官方 Docker Hub 镜像**;官方发 Docker tar 包(kingbase.com.cn 下载中心,需手动 `docker load`);社区镜像:`huzhihui/kingbase:v8r6`(V008R006C007B0012)、`warm3snow/kingbase:v8r6`(均 x86_64) | L0-T4 实测社区镜像;本机为 Apple Silicon 时需 `platform: linux/amd64` 模拟;结论落 `docs/references/kingbasees-environment.md` |
| PostgreSQL 镜像 | 17-alpine(成熟补丁线;KES 兼容口径要求保守 SQL,不追新特性) | `postgres:17-alpine` |
| RabbitMQ 镜像 | 4.x 现行 | `rabbitmq:4-management` |
| Redis 镜像 | 7-alpine(保守,BullMQ 完全兼容) | `redis:7-alpine` |
| Mailpit | axllent/mailpit(开发 SMTP 收件箱) | `axllent/mailpit:latest`(仅开发用) |
| zod | 安装到 v4.4.x(zod 4 现行) | 采用 v4 API |
| eslint-plugin-boundaries | 6.0.x(支持 ESLint 9 flat config) | 采用 |

## 实际安装版本(pnpm,2026-07-02)

```text
next 16.2.10        react/react-dom 19.2.4   typescript 5.9.3
next-intl 4.13.1    next-themes 0.4.6        zod 4.4.3
tailwindcss 4.3.2   @tailwindcss/postcss 4.x eslint 9.39.4
eslint-config-next 16.2.10                   eslint-plugin-boundaries 6.0.2
vitest 4.1.9        @vitest/coverage-v8 4.1.9
tsx 4.22.4          dotenv 17.4.2
@keycloak/keycloak-admin-client 26.6.4
```

## eslint-plugin-boundaries v6 实测结论

- v5 → v6 破坏性变更:规则 `boundaries/element-types` 更名为 **`boundaries/dependencies`**,规则选择器改为对象形式 `{ from: { type: "x" }, allow: { to: { type: [...] } } }`(旧字符串语法只告警不生效)。
- 元素默认 `mode: "folder"` 时 `pattern: "server/services/*"` 只匹配**子文件夹**,不匹配该层文件;本项目统一用 `mode: "full"` + `dir/**/*` 全路径匹配。
- 模式分组用花括号 `lib/{a,b}/**/*`(micromatch),不要用圆括号。
- `@/` 别名解析:settings `import/resolver: { typescript: { alwaysTryTypes: true } }` + devDep `eslint-import-resolver-typescript`(classic interfaceVersion 2 可用)。
- 调试:`ESLINT_PLUGIN_BOUNDARIES_DEBUG=1`,看 dependency 的 `to.path/type/isUnknown` 判断解析与元素匹配哪层失败。

## 已知注意事项

- pnpm 10 默认拦截依赖构建脚本;已在 `package.json` `pnpm.onlyBuiltDependencies` 放行 `esbuild`(tsx 依赖)。
- Node 本机 24.16,CI 用 22(均 ≥ Next 16 要求的 20)。
- `@types/node` 为 ^20,与运行时差异可接受(仅类型)。

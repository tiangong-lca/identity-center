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

## L2 追加查证(2026-07-02)

- **next-auth 5.0.0-beta.31**:v5 于 2024 底重写,对 Next 16 处于"beta 但生态广泛使用"状态;维护方对全新项目推荐 Better Auth。**本项目按设计文档/GOAL 锁定 Auth.js 不改**,此为生态风险注记(若后续 beta 线出现阻塞性问题,再走 decisions.md 提请裁决)。JWT 模块增强需在 d.ts 中显式 `import 'next-auth/jwt'`。
- **amqplib 2.0.1**:大版本自带 TypeScript 类型(移除 @types/amqplib);`connect()` 返回 `ChannelModel`;confirm channel + `waitForConfirms()` 可用。
- **drizzle-orm 0.45.2 / drizzle-kit 0.31.10**:稳定线(v1 仍 beta 不采用);无 down migration,回滚策略=dev 重建/prod 仅前滚。
- ioredis 5.11.1、pg 8.22。

## 已知注意事项

- pnpm 10 默认拦截依赖构建脚本;已在 `package.json` `pnpm.onlyBuiltDependencies` 放行 `esbuild`(tsx 依赖)。
- Node 本机 24.16,CI 用 22(均 ≥ Next 16 要求的 20)。
- `@types/node` 为 ^20,与运行时差异可接受(仅类型)。

## 安全驱动的依赖升级(2026-09-13,issue #17)

以下为2026-09-13的历史检查点；当前批准和验证结果见本文末尾的2026-09-14补充。

pnpm audit 基线:5 critical / 30 high / 42 moderate / 5 low → 升级后:**3 critical / 2 high / 17 moderate / 4 low**;剩余 3C/2H 全部为 next-auth/@auth/core(见下,待裁决)。

查证手段:registry dist-tags/依赖范围实查 + Context7(Next 16 升级指南;16.2→16.3 为常规 minor,本仓已用 `proxy.ts` nodejs runtime,不受 middleware→proxy 迁移影响)。

| 依赖 | 变更 | 理由 |
|---|---|---|
| next | 16.2.10 → **16.3.5** | 修 2× critical RCE(image optimization AVIF / windows 承载)+ 4× high(Server Actions DoS、Turbopack middleware 绕过、2× SSRF);16.3.5 自带 postcss 8.5.23 与 sharp ^0.35.4(libvips/libheif 修复);peer 仍兼容 react 19.2.4 / next-auth `^16` / next-intl `^16` |
| eslint-config-next | 16.2.10 → 16.3.5 | 与 next 同线;lint 规则集对现仓零新增告警 |
| shadcn | ^4.12.0 → ^4.21.0 | 其 @modelcontextprotocol/sdk 依赖范围覆盖修复版;配合范围内刷新:hono 4.13.7、@hono/node-server 1.19.17、qs 6.16.0、ip-address 10.7.0、fast-uri 3.1.7、undici 7.29.1 |
| vitest / @vitest/coverage-v8 | ^4.1.9 → ^4.1.11 | 修 @vitest/mocker 路径穿越(≥4.1.11);按 L0 决策留 4.x,不上 5.0 |
| js-yaml | 5.2.1 → 5.4.1 | 修流集合指数解析 DoS(≥5.2.2);^5 范围内;eslintrc 侧 js-yaml 4.3.0 → 4.3.2 同步 |

范围内传递刷新(`pnpm update --depth Infinity`):postcss 8.5.23/8.5.28、nanoid 3.3.19、brace-expansion 1.1.18 与 5.0.9、browserslist 4.28.9、baseline-browser-mapping 2.11.22。

**next-auth/@auth/core 未动**(next-auth:2C+1H+1M;@auth/core:1C+1H+1M):next-auth 5.0.0-beta.31 精确依赖 `@auth/core: "0.41.2"`,修复版 0.41.3 需 next-auth 5.0.0-beta.32(beta 线,5.0.0 stable 不存在)或 override。已向用户提请明确例外,授权前不升级、不加 override、不降级 v4、不改认证架构。

残留未修(含理由):
- dompurify 3.2.7(4 low / 8 moderate):monaco-editor 0.55.1 精确钉死;最新 0.56.0 也仅 3.4.8,升 monaco 只能部分覆盖且引入编辑器行为变化,不在本次 critical/high 基线内,defer。
- esbuild 0.18.20(1 moderate,dev server):drizzle-kit 0.31.10(latest stable)→ 废弃线 @esbuild-kit/core-utils@3.3.2 精确钉死;override 强升有破坏 drizzle-kit 风险;纯开发工具链,无运行时暴露。

验证(2026-09-13,issue #17 scope 扩展后):lint / typecheck / unit(80)/ build 全绿;**全量未过滤集成测试(本地 compose fixture)连续两轮 104 通过 / 0 失败 / 1 条按设计跳过(邮件链路,由 KC_SMTP_HOST 门控)**;邮件模式单独验证:SMTP realm(mailpit:1025)下 keycloak-email 1/1 绿,验证后已还原正则 realm(email 关闭)。seed-business-apps.test.ts 期望已修正为当前 catalog 真源(tiangong-lca 3 角色;cms 无 roles——yaml"方案 A"注释,准入走 accessClientRole 投影),以 vi.stubEnv 固化 CMS_* 占位解析(serialize.ts 语义:webhook.url 占位缺失→整个 webhook 省略),保留原幂等双跑与逐应用身份/角色断言。

共享 fixture 状态竞争修复(仅改测试,生产脚本/路由零改动,不筛测试、不全局串行):
- remediate-email-state.test.ts:sweep 是全 realm 操作,共享 company-dev 会扫到并行文件创建的未验证用户(幂等断言 second.patched 误报 1)。改为随机命名 disposable realm(remediate-it-<hex>:realms.create → setConfig → 全程隔离 → afterAll realms.del;API 经 SDK 26.6.4 typings 与 REST DELETE /admin/realms/{realm} 双源核对),断言保持 first≥1 / second===0,并行性不变。
- rate-limit.test.ts "不同 key 互不影响":固定 namespace 'test-iso' + 10s 窗口,计数跨重复运行泄漏;使用 `test-iso-${randomUUID()}` 作为按次唯一的 namespace,与同文件首个用例的 UUID 键保持一致。
- api-contract.test.ts 公共注册用例:register 限流 10 次/小时/IP,测试流量固定落 'local' 桶,多次运行累积后误触 429;注入按次唯一 x-forwarded-for。

pnpm-workspace.yaml:pnpm 11.9 在依赖更新时曾自动追加 `minimumReleaseAgeExclude: '@next/swc-win32-x64-msvc@16.3.5'`(该二进制发布于 2026-09-11T18:09Z,更新时约 23.4h,落入 pnpm 内建最小发布年龄窗);已移除该项,重跑 `pnpm install --frozen-lockfile` 于 ~24.3h 自然放行("Lockfile passes supply-chain policies, 1019 entries"),未放宽任何策略,workspace 文件保持干净。

主 Agent 复核进一步要求:随机测试 realm 仅在本次创建成功后清理,清理失败会显式使测试失败;Redis 测试键使用 UUID 隔离并发进程;注册入口使用文档地址段内的随机合法 IPv6,避免位运算生成负数 IPv4 或短周期地址复用。所有调整仅作用于测试 fixture。

## 2026-09-14：已批准的 Auth.js 修复与独立验证

用户批准 next-auth5.0.0-beta.32 例外；锁定依赖 @auth/core0.41.3。实际审计为0 critical /0 high /15 moderate /4 low，未添加 override。详见[决策D-006](../implementation/decisions.md)。

Primary独立完成 frozen install、lint/typecheck、80个unit、SMTP启用的105个integration；真实浏览器OIDC登录/退出/再登录两项测试也通过。SMTP测试使用独立临时realm和本地Mailpit，保留两种原有启用方式；畸形/带凭据URL拒绝且不泄露输入，关闭SMTP时不触发连接。浏览器测试按现有AutoSubmit及直接返回Keycloak的退出流程等待导航，不再竞争中间页按钮。验证使用独立本地账号并清理其Keycloak/数据库记录，保留共享种子管理员的强制首次改密要求。没有生产身份或业务数据变更。

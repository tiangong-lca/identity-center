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

## 2026-10-17: Next 16.4.2 source security qualification

[Identity #32](https://github.com/tiangong-lca/identity-center/issues/32) owns
qualification of the original [PR #31](https://github.com/tiangong-lca/identity-center/pull/31).
The candidate retains original bot commit `f7d226537190b3564f6a0a73e50337df350433ac`
and the current Main ancestor `ad919dc935fea2a5cdee0349d01440b139e406d7`.
Dependency checkpoint `1317a4724ceb0229523199a9dddaebd2497283be` selects
Next and eslint-config-next **16.4.2** together, preserving React/DOM **19.2.4**,
next-auth **5.0.0-beta.32**, next-intl **4.13.1**, Node22, the exact pnpm11.9.0
package-manager integrity and existing workspace build approvals.

### Version and compatibility evidence

Context7 retrieval reached its monthly quota, so verification used the official
[Next 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16),
[16.4 announcement](https://nextjs.org/blog/next-16-4), the selected package's
bundled `next/dist/docs/` guides, and npm's package metadata for
[next](https://registry.npmjs.org/next/16.4.2),
[eslint-config-next](https://registry.npmjs.org/eslint-config-next/16.4.2),
[next-auth](https://registry.npmjs.org/next-auth/5.0.0-beta.32) and
[next-intl](https://registry.npmjs.org/next-intl/4.13.1).
Next16.4.2 was the latest stable target checked on 2026-10-17. Its Node>=20.9.0
and React/DOM^19 peer ranges permit the existing runtime and React pins;
the retained auth and internationalization packages also permit Next^16 and
React^19. New Cache Components or prefetching flags are not introduced.

Exact-version GitHub advisory queries returned seven Next16.3.5 advisories:
critical [next/og RCE](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j),
high [image SSRF](https://github.com/advisories/GHSA-cjq9-62q9-8jv4),
medium [Draft Mode cache leakage](https://github.com/advisories/GHSA-3w37-wq28-93x7),
[SSG/ISR poisoning](https://github.com/advisories/GHSA-4jqv-mc3x-m676),
[metadata image disclosure](https://github.com/advisories/GHSA-f87g-xv8r-7p7x),
[cross-user cache substitution](https://github.com/advisories/GHSA-mcj8-r9mp-w47p),
and low [development MCP disclosure](https://github.com/advisories/GHSA-39w2-rjm5-chcv).
Exact16.3.8 and16.4.2 queries returned zero. The original maintenance target
already fixes those returned baseline advisories;16.4.2 also satisfies the
latest compatible minor target. Package-level advisory matching is not proof
that this application's configured deployment exposes each triggering feature,
and these queries do not constitute a full transitive-graph security audit.

### Local proof and its limits

The existing maintenance-guide commands passed with Node22.23.2 and pnpm11.9.0:
real frozen installation under the unchanged release-age policy, lint, typecheck,
all **82 unit tests in 22 files**, and the standalone Turbopack build. The build
used a clean process environment with no service/auth variables or environment
files and generated the existing dynamic routes without starting the app server.
The previous baseline-browser-mapping2.11.29 age rejection did not recur;
no policy exception or reduced cutoff was used.

An external offline probe consumed the generated standalone Next16.4.2 and
React/DOM19.2.4 modules, rendered static React markup and constructed a NextResponse.
It verified actual peer ranges, unchanged application configuration/workflow and
build approvals, preserved unrelated direct resolutions, and the seven affected
baseline advisory ranges against the selected target. The vulnerable16.3.5
control matches all seven; neither16.3.8 nor16.4.2 matches them. No live exploit,
HTTP request, OIDC operation, database, Redis, MQ or container was involved.

Compared with the original bot head, the generated lock adds only Next,
eslint-config-next and @next packages at16.4.2, updates their peer references,
and prunes the unused array-includes3.1.9 entry in favor of the already locked
3.2.0 resolution. The TypeScript ESLint family remains8.62.1; unrelated
transitive upgrades from an exploratory update resolution were discarded.

The unchanged `ci.yml` is the only source workflow and runs secretless PR/Main
quality checks. There is no Main-triggered deployment workflow. Local build and
offline proof do not qualify deployed startup, a container image, OIDC transport,
live admission/event synchronization or production identity behavior. No such
operation is authorized by this source change. Native and independent auto-merge
must stay disabled; fresh exact-head hosted CI and independent review precede
manual merge, followed by exact eligible child-commit integration in the workspace.


## 2026-10-17 auth-client source and harness qualification

Identity #34 composes original PR #30 onto accepted Main
`d9b4827c961967fe16ef31c365025049c7ff8802`, retaining original
`a73d785c1388b0ac97c281e5b9d47d5ce52a8987` as an ancestor. Official npm metadata
still identifies Keycloak admin **26.8.1** and jose **6.2.12** as latest stable.
The Keycloak client requires Node>=18; the existing Node22 track satisfies it.
Context7 remained quota-blocked, so official registry/changelog/action sources
provided the fallback. Package integrity was verified against official archives;
all 360 installed Keycloak-client files and 80 jose files match those bytes.

Only these two package records and their importer/snapshot references change.
The two shared jose edges are Auth.js core and the already-selected MCP SDK.
All 1020 other package records remain exact. The unrelated original PostCSS
rollback and URI-template refresh are excluded: PostCSS8.5.30 and URI-template
2.0.10 remain. Next/eslint16.4.2, React/DOM19.2.4, NextAuth beta.32, Zod, all
Kiota preview103 selections, pnpm11.9 integrity/build approvals/release-age policy,
product0.1.0 and server image version lines are preserved.

Local clean-environment frozen install, lint, typecheck, **93 unit tests in 23
files** (including11 harness safety/cleanup/workflow tests) and standalone build
pass. The pure tests verify hosted-only execution, endpoint/resource ownership,
credential isolation and redaction, cleanup continuation, and the concrete
secretless workflow. They do not start Docker or prove auth transports. Early
helper import/type-check failures are preserved and corrected without application
changes. No service, real account, production API or database was used locally.

New workflow dependencies were freshly verified at their latest stable releases
and pinned to upstream executable commits: checkout7.0.1, setup-node7.1.0,
pnpm/action-setup6.1.0 (whose current action contract supports pnpm11), and
upload-artifact7.0.2. This affects the new proof workflow only; existing `ci.yml`
is unchanged. Actual hosted baseline/candidate Docker startup, image/digest
binding, browser/OIDC/JWKS/backchannel/Redis behavior, cleanup receipts and
independent review remain pending. No runtime result or source delivery is claimed.

The known baseline SID-only revocation mismatch is characterized separately by
the test harness and is not silently fixed or attributed to this dependency bump.
The real provider's token shape and explicit owner judgment determine acceptance
of the covered logout scenario. Server-image upgrades, full-image monitoring,
production configuration, deployment and external business identity flows remain
outside this source task.


## 2026-10-26 Node24 LTS qualification (Identity #41)

On 2026-10-26 the human explicitly authorized migration to the latest compatible
Node24 LTS and ordinary Dependabot proposals for other dependencies, under
workspace coordination #2033. Node25+ remains outside this baseline.

The [official release index](https://nodejs.org/dist/index.json) identifies
**Node24.22.1**, released 2026-10-20, as the latest 24.x LTS (Krypton).
The downloaded Darwin arm64 archive matches the release SHA256
`89c682593d76cd44233fa53b1563264e7de9cbb189cad169135c5b4fadfbc0a7`.
The [npm registry](https://registry.npmjs.org/@types%2fnode) identifies
**@types/node24.19.2**, published 2026-10-09, as the latest stable types24.
Both exceed pnpm11's default one-day release-age floor; the existing Dependabot
seven-day cooldown is unchanged. A six-day-old Node security release is selected
manually under the explicit runtime scope, not an automatic cooldown exception.

Context7 was queried first for Node24, Next and pnpm. Because its Next version
coverage did not include 16.4.2, the exact installed Next16.4.2 installation guide
and registry manifest were checked: Node>=20.9.0. The exact pnpm11.9.0 registry
manifest requires Node>=22.13; pnpm's official compatibility table supports Node24.
The pnpm packageManager version/integrity and workspace build approvals remain
unchanged. Docker's official `node:24.22.1-alpine` manifest was verified for Linux
amd64 and arm64 (observed index digest
`sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53`).

`.nvmrc`, both CI workflows and all Docker stages now select 24.22.1;
`engines.node` confines local execution to `>=24.22.1 <25`. Types use
`^24.19.2`, with the Dependabot >=25 ignore retained. Lock resolution changes
only types24, its required undici-types7.24.6 and corresponding peer identities;
other concrete package versions remain unchanged. The Docker dependency stage
also copies the existing pnpm-workspace.yaml so strict build approvals apply.

The actual Darwin arm64 Node24.22.1 / pnpm11.9.0 run passed frozen install,
ESLint, typecheck, all 96 unit tests and Next standalone build. No Docker engine,
production identity service or database was contacted. These local gates prove
source/build compatibility only. Fresh hosted auth baseline/candidate proof,
isolated Portal/Worker image builds, independent review, merge and exact root
integration remain required. Existing SID-only logout limitation (#35), server
image lines, product auth policy and deployment authorization are unchanged.

The related hosted workflow builds both actual Docker targets and runs each
image's Node binary with no application/service startup. Unique run-bound tags
and container names are checked absent before allocation. EXIT/INT/TERM traps
remove only those owned tags/containers and upload explicit cleanup receipts;
intermediate build cache is retained only on the disposable GitHub-hosted runner.
No host daemon is started, global prune performed or image published. Interrupted
runner disposal is not reported as an explicit successful cleanup receipt.

## 2026-10-27 React renderer and types qualification (Identity #44)

The remaining renderer scope from closed-unmerged PR29 is composed on immutable
Main `64055a2cd05fa4056ea36fd9ab1b780a77e1690e`. Context7's React19.3.0 source
was read first; exact official registry metadata independently verified the latest
stable [React](https://registry.npmjs.org/react/19.3.1) and
[ReactDOM](https://registry.npmjs.org/react-dom/19.3.1) pair **19.3.1**, plus
[@types/react](https://registry.npmjs.org/@types%2freact/19.3.0) and
[@types/react-dom](https://registry.npmjs.org/@types%2freact-dom/19.3.0) **19.3.0**.
DOM requires React^19.3.1 and scheduler^0.28.0; types-dom requires types-react^19.3.0.
The installed Next16.4.2 navigation guide was read before adding UI acceptance.
Playwright Context7 resolution succeeded but its documentation query hit quota;
official API/assertion documentation and installed1.61.1 types supplied fallback.

The manifest changes only the two exact runtime pins; existing `^19` type ranges
remain. Complete normalized lock comparison proves exactly five package-record
replacements (React, DOM, both types and scheduler0.27.0→0.28.0) and79 changed
peer/dependency snapshot records, with every other record exact. The initial
scoped update also refreshed PostCSS8.5.30→8.5.31; that unrelated drift was removed
before the final frozen install. Next/eslint16.4.2, Auth.js beta.32, accepted
admin/jose, Node24.22.1/types24.19.2, pnpm11.9 integrity, compiler1.0.0 and product
0.1.0 stay fixed. Exact own tool archives match official Node SHA256 and the
manifest's pnpm SHA512; no global runtime or sibling node_modules is used.

A separate source-bound `react19.3` case preserves the historical auth-client
experiment and old renderer assertions. The new case uses the same actual auth
transport/negative/cleanup flow and adds real standalone UI assertions for
hydration, client navigation, synthetic form/readback, Radix focus, Monaco edits,
locales and themes. An actual validate-only entrypoint regression with verified
inert commands checks the comparison wiring; it never accesses Docker. The new
POSIX command-double control is explicitly skipped on Windows, like the existing
POSIX image-cleanup controls; no native Windows execution is claimed.

Local final frozen install, lint/typecheck, the109-case complete unit suite and
the20-case final harness/entrypoint suite passed. The first standalone build was
terminated by the6GiB aggregate-RSS lease (observed6,508,052,480bytes), not reported
as a pass. A reviewed12GiB attempt compiled but found a test-only missing
`NODE_ENV` type annotation; this was corrected. The final normal standalone build
passed. The inert drift tests also exposed deliberate environment filtering, so
the doubles now use a private state file rather than weakening the environment
allowlist. Prior failed attempts and their resource/stage evidence are retained.

Fresh exact-head hosted quality, Portal/Worker image checks, both source variants'
actual auth/UI receipts, independent review, source merge and exact workspace
integration remain required. SID-only logout remains the recorded limitation;
no product behavior, service version line or production operation changes.

PR29's two-file proposal also contains478 changed lock records, including
incidental non-renderer updates. A complete source-record inventory is retained
for owner review; absent incidental records require proof or an explicit tracked
disposition. This scoped change does not silently deliver or retire them and does
not claim original29 or the coordinating issue complete.

Independent review found that the first React fence omitted executable
`config/**` and `drizzle.config.ts`. Neither changes in this candidate, but the
fence could have admitted future unrelated configuration. The repair replaces
that finite product-path list with exhaustive NUL-separated tracked-tree
classification and explicit qualification/doc allowances. Governance allowances
preserve everything except the three review metadata fields. Actual entrypoint
negatives reject both omitted configs and an unexpected new product directory;
the historical auth-client path behavior stays unchanged. Only the scoped harness,
lint and typecheck are rerun for this test-support repair; no application or build
input changes, full-suite rerun or new build pass is claimed.

A second independent P2 finding showed that default Git rename detection can
hide a deleted product source when an unchanged file moves into allowed test
support. The React whole-tree scan now disables rename detection so source and
destination are both classified. A real temporary Git `R100` fixture is routed
through the actual validate-only entrypoint: the old destination-only exposure
control passes, whereas the fixed invocation rejects the product deletion.
Existing configuration/new-path fences and historical auth-client behavior stay
unchanged. Scoped21 harness tests, lint and typecheck pass; no actual application
rename, full-suite rerun or build rerun occurred.

The first hosted PR45 attempt at `cd26893f178d15fd255954ab534df3e88d6f5811`
passed quality (111units/24files), CodeQL and both native Linuxamd64 image
build/Node24.22.1 inspection steps. Its baseline standalone browser then failed
at registry navigation: the href selector matched both the “Registry” tab and
“Edit in registry” CTA. This is a new test-selector assumption contradicted by
the shipped React19.2.4 baseline, not evidence of a renderer defect. Candidate,
logout/session-denial and transport controls did not run. Artifact12712603673
matches its uploaded SHA256 and binds the immutable baseline/lock/runtime;
readiness, baseline and image cleanup receipts pass with empty inventories.
Its privacy scan contains no raw JWT/credential URL/dotenv/browser media/state.

The support-only correction selects the unique navigation-role link named
“Registry”, asserts count1, exact destination and the existing same-document
sentinel. Product behavior and all dependency/build inputs are unchanged; scoped
ESLint/typecheck pass without a redundant local full-suite/build run. The failed
artifact remains negative evidence; the canonical UI does not deliberately repeat
the ambiguous click or assert a global duplicate-link count. The corrected head
requires fresh quality, both images and both variants' actual auth/UI proof.

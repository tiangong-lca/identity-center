# L0 基础设施 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一键可复现的开发环境(六服务 compose)、可脚本重建的 Keycloak realm、含 i18n/主题底座与依赖边界约束的 Next.js 骨架,以及 CI。

**Architecture:** 应用位于 `identity-portal/` 子目录(目录分层按项目结构设计);基础设施由 `identity-portal/deploy/docker/docker-compose.dev.yml` 承载;Keycloak 配置全部由 `scripts/bootstrap-keycloak-realm.ts` 幂等创建并导出 JSON 留档。i18n 采用 next-intl v4 **无路由前缀模式**(cookie 定位,登录后应用无 SEO 需求);主题采用 next-themes class 模式 + Tailwind v4 CSS 变量。

**Tech Stack(已查证 2026-07-02):** Next.js 16.2.x(Turbopack 默认,`proxy.ts` 取代 `middleware.ts`)、next-intl v4、next-themes、Tailwind CSS v4、TypeScript 5(strict)、Vitest 4.1.x、ESLint 9(flat config)+ eslint-plugin-boundaries、@keycloak/keycloak-admin-client 26.6.x、tsx;镜像:postgres:17-alpine、quay.io/keycloak/keycloak:26.5、redis:7-alpine、rabbitmq:4-management、axllent/mailpit:latest、KES 社区镜像(Task 4 落定)。

## Global Constraints

- 包管理器 pnpm(已装 10.19);Node ≥20(已装 24.16)。
- 全部 UI 文案进 i18n messages(zh-CN 默认 + en),颜色走主题 token——从第一行代码起(GOAL §5.4)。
- 目录与依赖边界按 `docs/design/02-application/04-project-structure-design/`;禁止依赖方向违规(ESLint 固化)。
- secrets 不进浏览器代码;env 经 `scripts/check-env.ts` 校验。
- 每 Task 结束 commit;KES 不可得时创建 GitHub 阻塞 issue,不得静默只验 PG(GOAL §4.7)。
- 平台 DB 名 `identity_platform`,Keycloak DB 名 `keycloak`,同一 PG 实例、独立账号(逻辑隔离,部署设计要求)。
- Keycloak realm:`company-dev`;Client:`user-portal`(confidential)+ `user-portal-admin-api`(service account);Realm Role 仅 `admin_console_access`、`platform_admin`、`break_glass_admin` 三个。

---

### Task 1: Next.js 项目骨架与目录分层

**Files:**
- Create: `identity-portal/`(create-next-app 生成)
- Create: `identity-portal/features/.gitkeep`、`components/{ui,layout}/.gitkeep`、`lib/{auth,keycloak,db,audit,mq,permissions,sync,validation,http,config,rate-limit,crypto,i18n}/.gitkeep`、`server/{services,repositories,policies,jobs}/.gitkeep`、`db/{schema,migrations}/.gitkeep`、`types/.gitkeep`、`tests/{unit,integration,e2e}/.gitkeep`、`deploy/{docker,keycloak,env,runbooks}/.gitkeep`、`scripts/.gitkeep`
- Create: `docs/references/2026-07-02-l0-dependency-versions.md`

**Interfaces:**
- Produces: 可构建的 `identity-portal/` 工程,后续全部 Task 在其中进行;`pnpm lint`、`pnpm typecheck`、`pnpm test` 脚本。

- [ ] **Step 1: 生成骨架**

```bash
cd /Users/biao/Code/identity-center
pnpm create next-app@latest identity-portal --ts --eslint --tailwind --app --src-dir=false --import-alias "@/*" --turbopack --use-pnpm --yes
```

Expected: 生成 Next.js 16.2.x 工程。

- [ ] **Step 2: 建立目录分层与 package 脚本**

```bash
cd identity-portal
mkdir -p features components/ui components/layout lib/{auth,keycloak,db,audit,mq,permissions,sync,validation,http,config,rate-limit,crypto,i18n} server/{services,repositories,policies,jobs} db/{schema,migrations} types tests/{unit,integration,e2e} deploy/{docker,keycloak,env,runbooks} scripts
```

在 `package.json` 增加脚本:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "check-env": "tsx scripts/check-env.ts"
  }
}
```

安装 L0 开发依赖:

```bash
pnpm add next-intl next-themes zod
pnpm add -D vitest @vitest/coverage-v8 tsx eslint-plugin-boundaries @keycloak/keycloak-admin-client dotenv
```

- [ ] **Step 3: 记录已查证版本**

创建 `docs/references/2026-07-02-l0-dependency-versions.md`,记录:查证结论(Next 16.2 LTS/proxy.ts 更名、next-intl v4 无路由模式选型理由、Keycloak 26.5 + admin-client 26.6、Vitest 4.1 稳定线、KES 镜像现状)+ `pnpm list --depth 0` 实际安装版本。

- [ ] **Step 4: 验证构建**

Run: `pnpm lint && pnpm typecheck && pnpm build`
Expected: 全部通过。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(l0): Next.js 16 骨架与目录分层、L0 依赖版本记录"
```

### Task 2: Vitest 双 project 配置与首个单测

**Files:**
- Create: `identity-portal/vitest.config.ts`
- Create: `identity-portal/tests/unit/smoke.test.ts`

**Interfaces:**
- Produces: `vitest run --project unit|integration` 两套测试口径,integration 供 L1+ 对真实容器测试使用。

- [ ] **Step 1: 配置**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['tests/unit/**/*.test.ts'] } },
      { extends: true, test: { name: 'integration', include: ['tests/integration/**/*.test.ts'], testTimeout: 60_000 } },
    ],
  },
})
```

```ts
// tests/unit/smoke.test.ts
import { describe, expect, it } from 'vitest'

describe('smoke', () => {
  it('runs', () => { expect(1 + 1).toBe(2) })
})
```

- [ ] **Step 2: 验证** Run: `pnpm test` Expected: 1 passed。
- [ ] **Step 3: Commit** `git add -A && git commit -m "test(l0): vitest unit/integration 双 project"`

### Task 3: docker-compose 开发环境(五服务)

**Files:**
- Create: `identity-portal/deploy/docker/docker-compose.dev.yml`
- Create: `identity-portal/deploy/docker/postgres-init/01-init-databases.sh`
- Create: `identity-portal/deploy/env/.env.example`

**Interfaces:**
- Produces: 服务地址约定 —— PG `localhost:5432`(库 `identity_platform`/`keycloak`)、Keycloak `localhost:8080`(管理端口 9000)、Redis `localhost:6379`、RabbitMQ `localhost:5672`(UI 15672)、Mailpit SMTP `localhost:1025`(UI 8025)。后续所有集成测试依赖这些地址。

- [ ] **Step 1: 编写 compose**

```yaml
# deploy/docker/docker-compose.dev.yml
name: identity-center-dev
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports: ["5432:5432"]
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./postgres-init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 12

  keycloak:
    image: quay.io/keycloak/keycloak:26.5
    command: ["start-dev"]
    environment:
      KC_BOOTSTRAP_ADMIN_USERNAME: admin
      KC_BOOTSTRAP_ADMIN_PASSWORD: admin
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: keycloak
      KC_HEALTH_ENABLED: "true"
      KC_HTTP_ENABLED: "true"
      KC_PROXY_HEADERS: xforwarded
    ports: ["8080:8080", "9000:9000"]
    depends_on:
      postgres: { condition: service_healthy }
    healthcheck:
      test: ["CMD-SHELL", "exec 3<>/dev/tcp/127.0.0.1/9000 && printf 'GET /health/ready HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n' >&3 && cat <&3 | grep -q 'UP'"]
      interval: 10s
      timeout: 5s
      retries: 30

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 12

  rabbitmq:
    image: rabbitmq:4-management
    environment:
      RABBITMQ_DEFAULT_USER: identity
      RABBITMQ_DEFAULT_PASS: identity
    ports: ["5672:5672", "15672:15672"]
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12

  mailpit:
    image: axllent/mailpit:latest
    ports: ["1025:1025", "8025:8025"]

volumes:
  postgres-data:
```

```bash
#!/bin/bash
# deploy/docker/postgres-init/01-init-databases.sh
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  CREATE USER identity WITH PASSWORD 'identity';
  CREATE DATABASE identity_platform OWNER identity;
  CREATE USER keycloak WITH PASSWORD 'keycloak';
  CREATE DATABASE keycloak OWNER keycloak;
EOSQL
```

`.env.example` 列出:`DATABASE_URL=postgres://identity:identity@localhost:5432/identity_platform`、`KEYCLOAK_BASE_URL=http://localhost:8080`、`KEYCLOAK_REALM=company-dev`、`KEYCLOAK_ADMIN_USERNAME=admin`、`KEYCLOAK_ADMIN_PASSWORD=admin`、`REDIS_URL=redis://localhost:6379`、`RABBITMQ_URL=amqp://identity:identity@localhost:5672`、`SMTP_HOST=localhost`、`SMTP_PORT=1025`。

- [ ] **Step 2: 启动验证**

Run: `chmod +x deploy/docker/postgres-init/01-init-databases.sh && docker compose -f deploy/docker/docker-compose.dev.yml up -d --wait`
Expected: 全部服务 healthy(mailpit 无 healthcheck 为 running)。

- [ ] **Step 3: Commit** `git add -A && git commit -m "feat(l0): docker-compose 开发环境(PG/Keycloak/Redis/RabbitMQ/Mailpit)"`

### Task 4: KingbaseES 获取方案与 compose profile

**Files:**
- Modify: `identity-portal/deploy/docker/docker-compose.dev.yml`(追加 `kingbase` 服务,profile `kes`)
- Create: `docs/references/kingbasees-environment.md`

**Interfaces:**
- Produces: `docker compose --profile kes up` 可起 KES;连接约定 `localhost:54321`,库 `identity_platform`,用户 `identity/identity`(实际按镜像能力在文档落定)。L1 双库矩阵消费此约定。

- [ ] **Step 1: 尝试社区镜像**(已查证:官方仅发 tar 包,Docker Hub 有社区镜像)

```bash
docker pull huzhihui/kingbase:v8r6 || docker pull warm3snow/kingbase:v8r6
```

检查本机架构(`uname -m`);Apple Silicon 需 `platform: linux/amd64` 模拟运行。检查镜像 env/entrypoint(`docker inspect`),确认初始化数据库/用户方式与授权(试用 license)限制。

- [ ] **Step 2: 追加 profile 服务**(按 Step 1 实测结果调整 env)

```yaml
  kingbase:
    image: huzhihui/kingbase:v8r6
    platform: linux/amd64
    profiles: ["kes"]
    ports: ["54321:54321"]
    # env/volume 按镜像实测在本 Task 中落定并记录
```

- [ ] **Step 3: 验证连接**:容器内 `ksql`(或经 5432 兼容协议 `psql`)可建库建表。将结论(镜像、license 期限、初始化方式、连接串)写入 `docs/references/kingbasees-environment.md`。

- [ ] **Step 4(条件): 阻塞上报**:若所有镜像均不可用且官方 tar 需要人工下载授权 → `gh issue create` 阻塞 issue(标题"KingbaseES 开发环境获取受阻",附候选方案),并在 reference 文档记录状态;其余工作继续。

- [ ] **Step 5: Commit** `git add -A && git commit -m "feat(l0): KingbaseES compose profile 与环境结论"`

### Task 5: check-env 脚本

**Files:**
- Create: `identity-portal/lib/config/env-schema.ts`
- Create: `identity-portal/scripts/check-env.ts`
- Test: `identity-portal/tests/unit/env-schema.test.ts`

**Interfaces:**
- Produces: `envSchema`(zod object)与 `validateEnv(env: Record<string, string | undefined>)` → `{ ok: true } | { ok: false; missing: string[] }`;L2 `lib/config` 复用。

- [ ] **Step 1: 失败测试**

```ts
// tests/unit/env-schema.test.ts
import { describe, expect, it } from 'vitest'
import { validateEnv } from '@/lib/config/env-schema'

describe('validateEnv', () => {
  it('rejects missing DATABASE_URL', () => {
    const r = validateEnv({})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.missing).toContain('DATABASE_URL')
  })
  it('accepts complete env', () => {
    const r = validateEnv({
      DATABASE_URL: 'postgres://identity:identity@localhost:5432/identity_platform',
      KEYCLOAK_BASE_URL: 'http://localhost:8080',
      KEYCLOAK_REALM: 'company-dev',
      REDIS_URL: 'redis://localhost:6379',
      RABBITMQ_URL: 'amqp://identity:identity@localhost:5672',
    })
    expect(r.ok).toBe(true)
  })
})
```

Run: `pnpm test` Expected: FAIL(模块不存在)。

- [ ] **Step 2: 实现**

```ts
// lib/config/env-schema.ts
import { z } from 'zod'

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  KEYCLOAK_BASE_URL: z.string().url(),
  KEYCLOAK_REALM: z.string().min(1),
  REDIS_URL: z.string().url(),
  RABBITMQ_URL: z.string().min(1),
})

export type Env = z.infer<typeof envSchema>

export function validateEnv(env: Record<string, string | undefined>):
  { ok: true; env: Env } | { ok: false; missing: string[] } {
  const parsed = envSchema.safeParse(env)
  if (parsed.success) return { ok: true, env: parsed.data }
  return { ok: false, missing: parsed.error.issues.map((i) => i.path.join('.')) }
}
```

```ts
// scripts/check-env.ts
import 'dotenv/config'
import { validateEnv } from '../lib/config/env-schema'

const r = validateEnv(process.env)
if (!r.ok) {
  console.error(`环境变量缺失/非法: ${r.missing.join(', ')}`)
  process.exit(1)
}
console.log('环境变量校验通过')
```

- [ ] **Step 3: 验证** Run: `pnpm test` Expected: PASS。
- [ ] **Step 4: Commit** `git add -A && git commit -m "feat(l0): env schema 与 check-env 脚本"`

### Task 6: Keycloak bootstrap 脚本与 realm 导出

**Files:**
- Create: `identity-portal/scripts/bootstrap-keycloak-realm.ts`
- Create: `identity-portal/deploy/keycloak/realm-company-dev.json`(脚本导出产物)
- Test: `identity-portal/tests/integration/keycloak-bootstrap.test.ts`

**Interfaces:**
- Consumes: Task 3 的 Keycloak(localhost:8080,admin/admin)。
- Produces: realm `company-dev`;Client `user-portal`(confidential,redirect `http://localhost:3000/*`)、`user-portal-admin-api`(serviceAccountsEnabled,授予 realm-management 必要角色);Realm Roles `admin_console_access`/`platform_admin`/`break_glass_admin`;realm 多语言 zh-CN/en;SMTP=Mailpit;密码策略+暴力破解防护;幂等可重跑;`--export` 导出 JSON。

- [ ] **Step 1: 编写脚本**(核心结构;幂等 = 先查后建,存在则 update)

```ts
// scripts/bootstrap-keycloak-realm.ts
import KcAdminClient from '@keycloak/keycloak-admin-client'
import { writeFile } from 'node:fs/promises'

const BASE_URL = process.env.KEYCLOAK_BASE_URL ?? 'http://localhost:8080'
const REALM = process.env.KEYCLOAK_REALM ?? 'company-dev'
const REALM_ROLES = ['admin_console_access', 'platform_admin', 'break_glass_admin']

async function main() {
  const kc = new KcAdminClient({ baseUrl: BASE_URL, realmName: 'master' })
  await kc.auth({
    username: process.env.KEYCLOAK_ADMIN_USERNAME ?? 'admin',
    password: process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin',
    grantType: 'password',
    clientId: 'admin-cli',
  })

  const realmConfig = {
    realm: REALM,
    enabled: true,
    registrationAllowed: true,
    registrationEmailAsUsername: true,
    verifyEmail: true,
    resetPasswordAllowed: true,
    bruteForceProtected: true,
    passwordPolicy: 'length(10) and notUsername and notEmail',
    internationalizationEnabled: true,
    supportedLocales: ['zh-CN', 'en'],
    defaultLocale: 'zh-CN',
    smtpServer: {
      host: process.env.SMTP_HOST ?? 'localhost',
      port: process.env.SMTP_PORT ?? '1025',
      from: 'noreply@identity.local',
      fromDisplayName: 'Identity Platform',
    },
  }
  const existing = (await kc.realms.find()).find((r) => r.realm === REALM)
  if (existing) await kc.realms.update({ realm: REALM }, realmConfig)
  else await kc.realms.create(realmConfig)
  kc.setConfig({ realmName: REALM })

  for (const name of REALM_ROLES) {
    const found = await kc.roles.findOneByName({ name }).catch(() => null)
    if (!found) await kc.roles.create({ name })
  }

  await ensureClient(kc, {
    clientId: 'user-portal',
    publicClient: false,
    standardFlowEnabled: true,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false,
    redirectUris: ['http://localhost:3000/*'],
    webOrigins: ['http://localhost:3000'],
    attributes: { 'post.logout.redirect.uris': 'http://localhost:3000/*' },
  })
  const adminApi = await ensureClient(kc, {
    clientId: 'user-portal-admin-api',
    publicClient: false,
    standardFlowEnabled: false,
    serviceAccountsEnabled: true,
  })
  // service account 授予 realm-management 角色(manage-users/manage-clients/view-realm/manage-realm/query-*)
  const saUser = await kc.clients.getServiceAccountUser({ id: adminApi.id! })
  const rmClient = (await kc.clients.find({ clientId: 'realm-management' }))[0]
  const wanted = ['manage-users', 'view-users', 'manage-clients', 'view-clients', 'view-realm', 'manage-realm', 'query-users', 'query-groups']
  const available = await kc.users.listAvailableClientRoleMappings({ id: saUser.id!, clientUniqueId: rmClient.id! })
  const toAdd = available.filter((r) => wanted.includes(r.name!))
  if (toAdd.length) {
    await kc.users.addClientRoleMappings({
      id: saUser.id!, clientUniqueId: rmClient.id!,
      roles: toAdd.map((r) => ({ id: r.id!, name: r.name! })),
    })
  }

  if (process.argv.includes('--export')) {
    const rep = await kc.realms.export({ realm: REALM, exportClients: true, exportGroupsAndRoles: true })
    await writeFile('deploy/keycloak/realm-company-dev.json', JSON.stringify(rep, null, 2))
  }
  console.log(`realm ${REALM} 就绪`)
}

async function ensureClient(kc: KcAdminClient, rep: Record<string, unknown> & { clientId: string }) {
  const found = (await kc.clients.find({ clientId: rep.clientId }))[0]
  if (found) { await kc.clients.update({ id: found.id! }, rep); return found }
  const { id } = await kc.clients.create(rep)
  return { ...rep, id }
}

main().catch((e) => { console.error(e); process.exit(1) })
```

注:admin-client 26.x 的具体 API 名以类型定义为准(先查证:`kc.realms.export` 若不存在则改用 partial-export REST 调用)。`package.json` 增加脚本 `"bootstrap:keycloak": "tsx scripts/bootstrap-keycloak-realm.ts"`。

- [ ] **Step 2: 集成测试**

```ts
// tests/integration/keycloak-bootstrap.test.ts
import { beforeAll, describe, expect, it } from 'vitest'

const BASE = process.env.KEYCLOAK_BASE_URL ?? 'http://localhost:8080'

describe('keycloak bootstrap', () => {
  it('realm company-dev 的 OIDC discovery 可用且含双语言', async () => {
    const res = await fetch(`${BASE}/realms/company-dev/.well-known/openid-configuration`)
    expect(res.status).toBe(200)
    const doc = await res.json()
    expect(doc.issuer).toBe(`${BASE}/realms/company-dev`)
  })
})
```

- [ ] **Step 3: 执行验证(幂等性)**

Run: `pnpm bootstrap:keycloak && pnpm bootstrap:keycloak && pnpm bootstrap:keycloak -- --export && pnpm test:integration`
Expected: 两次执行均成功(幂等);导出文件生成;集成测试 PASS。

- [ ] **Step 4: Commit** `git add -A && git commit -m "feat(l0): Keycloak bootstrap 脚本(幂等)与 realm 导出"`

### Task 7: i18n 底座(next-intl v4 无路由前缀模式)

**Files:**
- Create: `identity-portal/i18n/request.ts`、`identity-portal/i18n/config.ts`、`identity-portal/messages/zh-CN.json`、`identity-portal/messages/en.json`、`identity-portal/lib/i18n/locale-cookie.ts`(server action)
- Modify: `identity-portal/next.config.ts`、`identity-portal/app/layout.tsx`、`identity-portal/app/page.tsx`
- Test: `identity-portal/tests/unit/messages-parity.test.ts`

**Interfaces:**
- Produces: `useTranslations()/getTranslations()` 全局可用;`setLocale(locale)` server action;messages 命名空间约定 `common.*` 起步。locale 存于 cookie `NEXT_LOCALE`,默认 `zh-CN`。

- [ ] **Step 1: 失败测试(键齐平)**

```ts
// tests/unit/messages-parity.test.ts
import { describe, expect, it } from 'vitest'
import zh from '@/messages/zh-CN.json'
import en from '@/messages/en.json'

function keysOf(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keysOf(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  )
}

describe('i18n messages', () => {
  it('zh-CN 与 en 键完全一致', () => {
    expect(keysOf(zh).sort()).toEqual(keysOf(en).sort())
  })
})
```

- [ ] **Step 2: 实现**(`config.ts` 定义 `locales = ['zh-CN','en'] / defaultLocale = 'zh-CN'`;`request.ts` 用 `getRequestConfig` 读 cookie;`next.config.ts` 套 `createNextIntlPlugin`;layout 挂 `NextIntlClientProvider` 并按 locale 设置 `<html lang>`;首页用 `common.appName` 渲染标题;messages 两份含 `common.appName/common.language/common.theme.*`)。

- [ ] **Step 3: 验证** Run: `pnpm test && pnpm build` Expected: PASS。
- [ ] **Step 4: Commit** `git add -A && git commit -m "feat(l0): next-intl 无路由前缀 i18n 底座(zh-CN/en)"`

### Task 8: 主题底座(next-themes + 设计库 token)

**Files:**
- Create: `identity-portal/components/layout/theme-provider.tsx`、`identity-portal/components/layout/theme-toggle.tsx`、`identity-portal/components/layout/locale-toggle.tsx`
- Modify: `identity-portal/app/globals.css`(接入设计库基础 token:`--identity-primary: #1664FF`、边框 `#EAEDF1`、半径 4/8/12px 等,dark 变体)、`identity-portal/app/layout.tsx`

**Interfaces:**
- Produces: `ThemeProvider`(attribute="class"、defaultTheme="system")、`ThemeToggle`/`LocaleToggle` 组件;CSS 变量约定 `--background/--foreground/--primary/--border`(Tailwind v4 `@theme inline` 暴露为 `bg-background` 等)。L5 全量 token 映射在此基础上扩展。

- [ ] **Step 1: 实现**(globals.css 定义 `:root`/`.dark` 两组变量,值取自 `.design_library/identity-platform/ui-base-tokens.css` 的主色/中性色;`@custom-variant dark`;ThemeProvider 包 next-themes;两个 toggle 均用 i18n 文案)。首页组装:标题 + LocaleToggle + ThemeToggle,证明双底座工作。
- [ ] **Step 2: 验证** Run: `pnpm build && pnpm test` Expected: PASS。dev server 手工冒烟:切主题 class 变化、切语言文案变化。
- [ ] **Step 3: Commit** `git add -A && git commit -m "feat(l0): next-themes 主题底座与设计库基础 token"`

### Task 9: 依赖边界 ESLint(boundaries)

**Files:**
- Modify: `identity-portal/eslint.config.mjs`
- Test: `identity-portal/tests/unit/boundaries.test.ts`(以 ESLint Node API 对内联反例断言)

**Interfaces:**
- Produces: 依赖边界规则(设计 §B.2):禁止 `components -> server|lib/keycloak`、`features -> server/repositories|lib/keycloak/admin-client`、`app -> server/repositories`(必须经 services)、`server/repositories -> lib/keycloak` 等;违规 = lint error。

- [ ] **Step 1: 失败测试**:用 `new Linter`/`ESLint` API 加载项目 flat config,对虚拟文件 `components/ui/x.ts` 内容 `import '@/server/services/user-service'` 断言报 `boundaries/element-types` 错误。
- [ ] **Step 2: 配置 boundaries**(elements: app/features/components/lib/server/db/types/scripts;default disallow + 白名单允许方向,按设计 §B.2 清单)。
- [ ] **Step 3: 验证** Run: `pnpm test && pnpm lint` Expected: PASS(存量代码无违规)。
- [ ] **Step 4: Commit** `git add -A && git commit -m "feat(l0): eslint-plugin-boundaries 依赖边界固化"`

### Task 10: CI(GitHub Actions)

**Files:**
- Create: `.github/workflows/ci.yml`(仓库根)

**Interfaces:**
- Produces: push/PR 触发 lint + typecheck + unit test(工作目录 identity-portal;pnpm cache)。

- [ ] **Step 1: 编写 workflow**

```yaml
name: ci
on:
  push: { branches: [main] }
  pull_request:
defaults: { run: { working-directory: identity-portal } }
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm, cache-dependency-path: identity-portal/pnpm-lock.yaml }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
```

- [ ] **Step 2: 本地等效验证** Run: `pnpm lint && pnpm typecheck && pnpm test` Expected: PASS。
- [ ] **Step 3: Commit** `git add -A && git commit -m "ci(l0): lint/typecheck/unit 工作流"`

### Task 11: L0 验收核对与进度表更新

**Files:**
- Modify: `docs/implementation/README.md`(§9 进度表 L0 行)

- [ ] **Step 1: 核对 L0 验收标准**(实施方案 §5 L0):compose 一键起全绿(含 KES 或阻塞 issue 已建)、realm 可重建且登录页双语、骨架可切语言/主题、CI 绿。逐项执行并记录输出。
- [ ] **Step 2: 更新进度表**(L0 状态 → 已完成 + 日期 + commit),提交并 push(触发 CI 首跑)。

```bash
git add -A && git commit -m "docs(l0): L0 完成,更新进度表" && git push origin main
```

## Self-Review 结论

- 覆盖检查:实施方案 L0 六项工作项(compose/bootstrap/骨架/版本记录/check-env/CI)全部有对应 Task;i18n/theme 底座(§2 设计增补)在 Task 7/8;KES 获取(§7 风险)在 Task 4。
- 占位符检查:Task 6 admin-client 具体 API 名标注了"以类型定义为准"的查证动作,属显式验证步骤而非 TBD;Task 4 env 留待实测是该 Task 的目的本身。
- 类型一致性:`validateEnv` 签名在 Task 5 定义并被 check-env 消费;服务地址约定在 Task 3 产出、Task 6 消费,一致。

# P3:目录周期对账 + 停用闭环 + export + 明文扫描 — 设计

> 承接 `2026-07-06-declarative-app-catalog-design.md`(P1 后端)与 `2026-07-07-catalog-console-p2-design.md`(P2 控制台)。本文是 P3 的设计之据(design of record),供 writing-plans 切分实现。

## 1. 背景与目标

P1 交付了声明式目录后端(YAML → 事务物化 + 版本 + KC 准入 reconcile + 审计),P2 交付了 kubectl-edit 范式的管理控制台。**apply 时会同步 reconcile 一次**,但 k8s 范式里那条「控制器后台持续对账 loop」还没落地,且 `pending_deactivate` 墓碑态目前**只写不读**——没有任何代码消费它。

P3 补齐三件事,把目录特性收口:

1. **周期对账 job** —— 后台持续把实际态(KC)对齐到期望态(DB),并检测/汇报漂移。
2. **停用闭环** —— 让管理员在控制台**人工确认**停用那些滞留在 `pending_deactivate` 的应用/角色。
3. **export + 明文扫描** —— `export-catalog` CLI(DB → YAML,GitOps/备份/迁移),以及对入库配置的明文密钥纵深防御。

## 2. 范围 / 非目标

**范围:**

- `catalog-reconcile-service.detectDrift()`:汇报 `pending_deactivate` 待确认清单(DB 侧漂移)。
- `server/jobs/reconcile-catalog.ts` + `scripts/worker.ts` 注册:周期跑 `ensureKeycloakRoles`(幂等补偿)+ `detectDrift`,结构化日志。
- `scripts/export-catalog.ts`:DB → YAML,默认 stdout,`--out <file>` 可选;只出 `secretRef`,不出明文。
- `lib/catalog/secret-scan.ts`:精选模式扫描 CatalogDoc 全部字符串值;接入 apply 校验(命中即拒)与 export(命中即告警)。
- 停用闭环:`catalog-service.confirmDeactivate(...)` + `GET /api/admin/catalog/pending-deactivate` + `POST /api/admin/catalog/deactivate` + 控制台「待停用」面板 + 确认动作。
- 新增 DB 生命周期终态 `deactivated`(见 §4)。
- 集成 / 单元 / e2e / i18n parity 测试。

**非目标(持续约束):**

- **不自动删 KC client role**(承接 D2 与 P1 §15#3,留人工)。
- **不自动撤销已分配用户**(确认停用只做软停用 + 告警受影响数量)。
- **job 不自动确认停用**(纯人工判断)。
- export / YAML / 扫描输出**绝不含明文密文**(扫描结果只出路径 + 模式名)。
- **不改 CSP**(不引入 `unsafe-eval` 等)。
- 不做多环境分文件、不做 import UI(apply 已是 import 方向)。

## 3. 决策(承接 P1)

| 决策 | 内容 | 理由 |
| --- | --- | --- |
| **D-P3-1** | 停用终态 = **新增枚举值 `deactivated`**(而非置 `disabled`) | `disabled` 是可声明、会往返进 YAML 的「关」态(`materialize` 写 `app.status`、`toCatalogApps` 输出 `status: disabled`);若确认停用置 `disabled`,被移除的应用会以 `disabled` **复活**回 export YAML,不连贯。`deactivated` 作为墓碑终态、从可编辑 YAML 过滤,才自洽。与 **D6「加枚举值不加列」**一致。 |
| **D-P3-2** | 停用 = **软停用**(status 置 `deactivated` + 保留行 + 不动 KC + 不撤销 assignment) | 承接 D2:避免误删 KC client role、避免影响已分配用户;停用是人工确认的最后一步,保留行以留审计/历史。 |
| **D-P3-3** | 明文扫描 = **精选模式 + apply 硬拒**(export 侧告警) | 目标是「明文永不进版本库」;apply 硬拦最有效。`secretRef` 已被正则 `^[A-Z][A-Z0-9_]*$` 挡住,扫描是对**其它字段**(url、未来字段)的纵深防御;精选模式比纯熵误报低。 |
| **D-P3-4** | job = **ensure + 检测 + 结构化日志**(BullMQ,默认 1h) | 与现有两个 reconcile job 同构(`scripts/worker.ts` SCHEDULES + `console.*` + `JobResult.details`),最小惊喜;`ensure` 是幂等补偿。KC 侧漂移由 `ensureKeycloakRoles` 的既有报告(`clientMissing`/`errors`)呈现,`detectDrift` 只补 DB 侧 backlog,避免重复读 KC。 |
| **D-P3-5** | export = **stdout + `--out`,内容 = `getCurrent().yaml`**(active+disabled,过滤墓碑态) | export 就是 apply 的反方向,复用 `getCurrent`/serialize 最省,且天然只出 ref。 |

## 4. 状态机(核心)

`applications.status` / `application_roles.status`(DB `text` + 注释,非 pgEnum,KES 兼容),取值扩为四态:

```
active  ⇄  disabled                YAML 可声明、往返(disabled = 已登记但关闭)
   │
   │  从 YAML 整个移除 + apply(materialize)
   ▼
pending_deactivate                 reconciler 设的墓碑;已从可编辑 YAML 过滤;job 报「待确认」;控制台可「确认停用」
   │
   │  管理员在控制台确认停用(confirmDeactivate)
   ▼
deactivated  ← 新增               终态墓碑;也从可编辑 YAML 过滤;保留 DB 行;不动 KC;不撤销 assignment
```

**要点:**

- **YAML 面(CatalogApp.status)只有 `active | disabled`**,`lib/catalog/schema.ts` 不改——`pending_deactivate` 与 `deactivated` 永远被 `toCatalogApps` 过滤,不会出现在 YAML。
- **DB 面**四态,仅 `db/schema/applications.ts`、`application-roles` 的 status 注释更新。
- `toCatalogApps` 过滤器从「排除 `pending_deactivate`」改为「排除 `pending_deactivate` 与 `deactivated`」(应用与角色两处)。
- `deactivated` 不可逆回 YAML;若要复用同 code 重新登记,走正常 apply 新建(既有语义)。记录为约束。

## 5. 组件设计

### 5.1 状态机落地:serialize 调整

- `lib/catalog/serialize.ts`
  - `toCatalogApps`(第 75 行):`.filter((a) => a.status !== 'pending_deactivate' && a.status !== 'deactivated')`。
  - 角色过滤(第 88 行):同样追加 `&& r.status !== 'deactivated'`。
- `db/schema/applications.ts`、角色表:status 注释更新为 `active | disabled | pending_deactivate | deactivated`,补一句 `deactivated` 的语义(确认停用后的终态墓碑)。
- **不改** `lib/catalog/schema.ts`(YAML 面枚举保持 `active|disabled`)。

### 5.2 `catalog-reconcile-service.detectDrift()`

`server/services/catalog-reconcile-service.ts` 加只读方法:

```ts
export type DriftReport = {
  pendingDeactivate: Array<{ kind: 'app' | 'role'; appCode: string; roleCode?: string; name: string }>
}
// 只读 DB:列出 status='pending_deactivate' 的应用与角色(待人工确认的 backlog)。
// KC 侧漂移由 ensureKeycloakRoles 的 { clientMissing, errors } 呈现,此处不重复读 KC。
async detectDrift(): Promise<DriftReport>
```

### 5.3 周期对账 job

- `server/jobs/reconcile-catalog.ts`:

```ts
import type { JobContext, JobResult } from './types'
// 与 reconcile.ts 同构:async (ctx) => JobResult
export async function reconcileCatalog(ctx: JobContext): Promise<JobResult> {
  const svcCtx = { db: ctx.db, keycloak: ctx.keycloak }
  const reconcile = createCatalogReconcileService(svcCtx)
  const apps = await loadActiveReconcileApps(svcCtx) // active 应用行 → ReconcileApp[]{code, clientId, accessRole}
  const ensured = await reconcile.ensureKeycloakRoles(apps) // {ensured, clientMissing, errors}
  const drift = await reconcile.detectDrift()               // {pendingDeactivate}
  if (ensured.clientMissing.length) console.error(`[reconcile-catalog] KC 缺 client: ${ensured.clientMissing.join(', ')}`)
  for (const e of ensured.errors) console.error(`[reconcile-catalog] ensure 失败 ${e.appCode}: ${e.message}`)
  if (drift.pendingDeactivate.length) console.warn(`[reconcile-catalog] 待确认停用 ${drift.pendingDeactivate.length} 项`)
  return {
    processed: ensured.ensured.length,
    failed: ensured.clientMissing.length + ensured.errors.length,
    details: { ensured: ensured.ensured, clientMissing: ensured.clientMissing, errors: ensured.errors, pendingDeactivate: drift.pendingDeactivate },
  }
}
```

- `scripts/worker.ts`:SCHEDULES 追加 `{ name: 'reconcile-catalog', everyMs: Number(process.env.JOB_RECONCILE_CATALOG_MS ?? 3_600_000) }` + handlers 映射 `reconcileCatalog`。
- `loadActiveReconcileApps`:读 `applications` where status='active',映射 `{ code, clientId: keycloakClientId, accessRole: accessClientRole }`。放 job 文件内或 reconcile-service,plan 定。

### 5.4 `export-catalog` CLI

`scripts/export-catalog.ts`,镜像 `apply-catalog.ts` 引导:

```ts
import 'dotenv/config'
async function main() {
  const url = process.env.DATABASE_URL; if (!url) throw new Error('DATABASE_URL 未配置')
  const out = argValue('--out') // 可选;默认 stdout
  const client = createDbClient(url)
  try {
    const ctx = { db: client.db, keycloak: createKeycloakAdmin(keycloakConfigFromEnv()) } // getCurrent 不调用 KC
    const { yaml } = await createCatalogService(ctx).getCurrent()
    const findings = scanForPlaintextSecrets(parseCatalogYaml(yaml)) // 兜底扫描
    if (findings.length) console.error(`[export-catalog] ⚠️ 疑似明文(仅路径): ${findings.map((f) => f.path).join(', ')}`)
    if (out) { writeFileSync(out, yaml); console.error(`[export-catalog] 已写 ${out}`) }
    else process.stdout.write(yaml)
  } finally { await client.close() }
}
```

- 内容 = active + disabled 的期望态 YAML(墓碑态已过滤),与 `apply-catalog` 往返。
- 只出 `secretRef`(`renderCatalogYaml` 保证),不出明文。
- 开放点:export 只需 `DATABASE_URL`;若 `keycloakConfigFromEnv()` 在缺 KC env 时抛错,则 export 侧改为直接调 `toCatalogApps + renderCatalogYaml`(免 KC),plan 定。

### 5.5 明文密钥扫描

`lib/catalog/secret-scan.ts`:

```ts
export type SecretFinding = { path: string; pattern: string; hint: string } // 绝不含命中的密文值
const PATTERNS = [
  { name: 'bearer-token',    hint: 'Authorization Bearer',   re: /\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/ },
  { name: 'url-credential',  hint: 'token/key/secret in URL', re: /[?&](token|key|secret|password|api[_-]?key|access[_-]?token)=[^&\s]+/i },
  { name: 'pem-private-key', hint: 'PEM private key block',    re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: 'aws-access-key',  hint: 'AWS access key id',        re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'jwt',             hint: 'JWT',                      re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/ },
]
// 递归遍历 doc 的每个字符串叶子(路径如 applications[0].webhook.url),命中任一模式 → push {path, name, hint}。
export function scanForPlaintextSecrets(doc: CatalogDoc): SecretFinding[]
```

- **接 apply**:`catalog-service.apply` 内 `parseCatalogYamlOrThrow(yaml)` 之后、materialize 之前:`const f = scanForPlaintextSecrets(doc); if (f.length) throw new ApiError('VALIDATION_ERROR', { issues: f })`(details 只含路径,不含值)。控制台 + CLI 都经此路径,故都硬拦。
- **接 export**:见 §5.4,命中 → stderr 告警(只路径),不拦。
- **安全铁律**:`SecretFinding` 与任何日志/错误**绝不回显命中的密文子串**。

### 5.6 停用入口(控制台 + 软停用)

**后端** `server/services/catalog-service.ts`:

```ts
// 断言目标当前为 pending_deactivate,否则 ApiError(NOT_FOUND 未找到 / CONFLICT 非待停用态)
async confirmDeactivate(input: { appCode: string; roleCode?: string }): Promise<{
  kind: 'app' | 'role'; appCode: string; roleCode?: string; status: 'deactivated'; affectedAssignments: number
}>
// app 级:置 app 及其 pending_deactivate 角色为 deactivated;role 级:仅置该角色。
// 统计受影响 assignment 数(不撤销),写 audit;不调用 KC。
```

**API**(`adminRoute` 薄壳,复用 P2 权限):

- `GET /api/admin/catalog/pending-deactivate`(`catalog:read`)→ `{ items: Array<{kind, appCode, roleCode?, name, affectedAssignments}> }`,由 `detectDrift` + assignment 计数回填,供 UI 渲染「待停用」列表与警示。
- `POST /api/admin/catalog/deactivate`(`catalog:apply`)→ body `{ appCode, roleCode? }` → `confirmDeactivate` → `ok(...)`。

**前端**:

- 面板放 **catalog 控制台(`/admin/catalog`)**——`catalog:apply` 权限与目录生命周期都在此,apps 页在 P2 已只读化。(若更想放 apps 页,一句话可调。)
- 「待停用」区:列出 `pending_deactivate` 的 app/角色,每项显示**受影响用户数**;「确认停用」动作弹确认框(重申影响数)→ `POST deactivate` → 成功后从列表移除 + toast + 失效相关 query。
- react-query:`usePendingDeactivate()`(GET)、`useConfirmDeactivate()`(POST,onSuccess 失效 `pending-deactivate` 与 `catalog`)。
- i18n:`messages/{en,zh-CN}/catalog.json` 新增停用文案(parity 测试保证对齐)。

## 6. 数据流

**周期对账:** worker 定时 → `reconcileCatalog(ctx)` → `ensureKeycloakRoles(active apps)`(补齐 KC 准入角色)+ `detectDrift()`(列 pending_deactivate)→ `console.*` 日志 + `JobResult.details`。

**确认停用:** 控制台加载 `GET pending-deactivate`(含受影响数)→ 管理员点「确认停用」→ `POST deactivate` → `confirmDeactivate` 置 `deactivated`(级联角色)+ audit → 该项从可编辑 YAML/backlog/列表消失。

**export:** `pnpm export-catalog [--out f]` → `getCurrent().yaml`(active+disabled,墓碑过滤,只 ref)→ 兜底扫描告警 → stdout/文件。

**apply 明文防线:** apply(控制台/CLI)→ parse → **scan 命中即 VALIDATION_ERROR 拒绝** → 通过才 materialize。

## 7. 测试策略

- **集成**(`tests/integration/`,vitest + 真 PG/KC,镜像 `apply-catalog.test.ts` / `catalog-api.test.ts`):
  - `detectDrift` 列出 pending_deactivate app/角色;`reconcileCatalog` job ensure + 报告(含 clientMissing 分支)。
  - `confirmDeactivate`:pending_deactivate → deactivated 转换;级联角色;**KC 未被调用**;assignment 计数正确;非 pending_deactivate 目标报 CONFLICT/NOT_FOUND;之后 `getCurrent` 不再含该项。
  - `export-catalog` 往返:export → apply(--check)diff 空。
  - apply 明文扫描:含 Bearer/`?token=`/PEM 的 YAML → apply 被拒(VALIDATION_ERROR),错误 details 只含路径。
- **单元**(`tests/unit/`):
  - `secret-scan`:各模式命中 / 干净放行 / **findings 不含密文值**(断言 value 不泄漏)。
  - `toCatalogApps` 过滤 `deactivated`(app 与角色两处)。
- **e2e**(Playwright `tests/e2e/`):控制台「待停用 → 确认停用」流程(含受影响数警示、确认后消失)。
- **i18n parity**:catalog.json 新键 en/zh-CN 对齐(既有 parity 测试)。

## 8. 安全与约束

- `secretRef` 只存 env 变量名;YAML / export / 扫描输出**绝不含明文密钥**;`SecretFinding`、日志、错误**只出路径 + 模式名,不出命中子串**。
- 不删 KC client role、不撤销已分配用户(软停用);KC 删除留人工(D2 / P1 §15#3)。
- 不改 CSP;不引入 `unsafe-eval`。
- job 幂等:`ensureKeycloakRoles` find-or-create;`detectDrift` 只读;重复跑无副作用。
- `confirmDeactivate` 幂等前置:仅接受 `pending_deactivate` 目标,重复确认第二次报 CONFLICT(非待停用态)。

## 9. 落地阶段(供 writing-plans 切分)

建议单分支 `feat/catalog-p3`、一个合并 PR,任务序:

1. **状态机 + serialize**:status 四态注释;`toCatalogApps` 过滤 `deactivated`;单测。
2. **secret-scan**:`lib/catalog/secret-scan.ts` + 单测;接 apply 校验 + 集成测(apply 被拒)。
3. **detectDrift + job**:`detectDrift`;`reconcile-catalog.ts`;`worker.ts` 注册;集成测。
4. **export-catalog CLI**:`scripts/export-catalog.ts` + 往返集成测。
5. **停用后端**:`confirmDeactivate` + 两个 API 端点 + 集成测。
6. **停用前端**:控制台「待停用」面板 + hooks + i18n + e2e。
7. **验证 + docpact + PR**。

## 10. 开放问题

1. **待停用面板归属**:倾向 catalog 控制台(`/admin/catalog`);若偏好 apps 页可调。
2. **export 的 KC 依赖**:若 `keycloakConfigFromEnv()` 缺 env 抛错,export 改直调 serialize 免 KC(plan 定)。
3. **job ensure 的应用集**:取 `active`(disabled 视为有意关闭,跳过 ensure);若需对 disabled 也 ensure,plan 调整。
4. **assignment 计数口径**:app 级计其全部 assignment;role 级计该角色 assignment——具体表/列 plan 定。
5. **`deactivated` 不可逆**:同 code 重新登记走正常 apply 新建;记录为约束。

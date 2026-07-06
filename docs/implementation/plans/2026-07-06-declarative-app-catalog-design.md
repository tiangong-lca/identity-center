# 业务应用目录声明式配置(YAML + 控制台可编辑)设计

> **状态:** Draft(brainstorming 产出,待评审;评审通过后由 superpowers:writing-plans 切分实现计划)
> **日期:** 2026-07-06
> **仓库:** identity-center(功能全部落在本仓,不跨仓)
> **关联:**
> - 取代/演进:[`2026-07-03-tiangong-lca-app-registration.md`](./2026-07-03-tiangong-lca-app-registration.md)(seed 登记方案)
> - 命名与角色契约(逐字):carbon-workspace `_docs/plans/2026-07-03-lca-platform-identity-center-integration-design.md` §4.5/§5
> - 技术契约:[`docs/guides/business-app-integration-spec.md`](../../guides/business-app-integration-spec.md);接入指南:[`docs/guides/business-app-onboarding.md`](../../guides/business-app-onboarding.md)

---

## 1. 背景与问题

业务应用目录(`applications` + `application_roles` 两表)目前靠 `identity-portal/scripts/seed/business-apps.ts`(`seedBusinessApps`)+ admin API CRUD 维护。存在的问题:

- **seed 只增不改**:内嵌 legacy `supabase` 占位行迁移逻辑,是一次性引导;改已有应用的 `name`/`webhookUrl`/角色不生效,且无漂移对账。
- **无声明式真源**:admin CRUD 分散,批量维护多应用/多角色困难,无版本、审计、回滚。
- **两处手动**:Keycloak 的 accessRole + 业务角色(client role)与 IC 登记分别手动维护,易不一致。

**目标:** 用一份**声明式目录**作为业务应用注册的真源,支持**控制台编辑**(采用 Kubernetes `kubectl edit`/Dashboard 范式),自动 reconcile 到 IC 表 + Keycloak client roles,并带**版本 / 审计 / 回滚 / 乐观并发 / 漂移检测**。

---

## 2. 范围与非目标

### 范围
- IC 登记:`applications` + `application_roles` 的声明式 upsert。
- Keycloak 客户端角色:在**已有** client 上 ensure `accessRole` + 业务角色(client role)。
- 控制台 YAML 编辑器(Monaco)+ 版本历史 + 回滚。
- CLI(apply / export)+ worker 周期对账 job。

### 非目标
- **不创建 Keycloak client 本身**:confidential client + client secret 由 realm 配置 / IaC 另建(见接入指南「接入十步」第 1 步)。理由见 D1。
- **不管用户级授权分配**:准入 grant / 业务角色 assign 仍走注册审批流 + 运行时(见集成设计 §4)。
- **YAML 不含明文密钥**:只放 env 变量名 ref(见 D3)。
- 不改事件 / webhook 契约,不改登录门。

---

## 3. 关键设计决策

| # | 决策 | 理由 |
|---|---|---|
| **D1** | 范围 = IC 登记 + KC **client role**;**不建 client** | 建 confidential client 涉及 secret 生成/管理,安全敏感,且通常由 realm import/IaC 管;而 client role 创建 `@keycloak/keycloak-admin-client` 已支持(`clients.createRole`),`admin-client.ts` 已封装 `findRole`/`createRole`/`findClientByClientId`。 |
| **D2** | 漂移 = upsert + 标记 `pending_deactivate`(**不自动删/停**) | 拿到声明式更新的收益,同时避免误删 YAML 条目导致线上应用被停或影响**已分配用户**;停用需人工确认另走流程。 |
| **D3** | 密钥 = YAML 只放 `secretRef`(env 变量名),真值在 env/vault | 配置入库、进版本、可能导出到 Git,严禁明文。 |
| **D4** | apply = `pnpm apply-catalog` 命令(部署/CI/手动)+ worker 周期 reconcile job | 命令负责变更落地;job 负责持续对账/漂移检测。复用现有 `server/jobs/reconcile.ts` 模式(`reconcileApplicationProjections` 已在做「应用投影对账」)。 |
| **D5** | 真源与编辑范式(**k8s**)= DB 为主;YAML 为编辑/交换格式;控制台走 `kubectl edit` 范式;Git 降为可选 export/import | 满足「控制台可编辑」要求,同时白捡 k8s 验证过的健壮机制(schema 校验、乐观并发、版本回滚)。见 §4。 |
| **D6** | `pending_deactivate` = **status 枚举新增值**(而非单列) | 与既有 `status`(active/inactive)同轴,查询/展示一致;避免多列语义漂移。 |
| **D7** | 现有 admin **目录写端点禁用**(改由 catalog 管) | 避免绕过 reconcile + 版本 + 并发保护造成双写漂移;GET + 用户级 assignment 端点不变。 |

---

## 4. 架构:期望态 / 实际态 / reconcile(k8s 类比)

采用 k8s「声明式期望态存于中心存储,控制器持续 reconcile 实际态」范式。**控制台编辑 = `kubectl edit`/Dashboard 那条路**(编辑活对象,不是 GitOps 那条 Git-为主的路)。

| k8s | 本设计 |
|---|---|
| etcd(活对象 = 期望态)| **DB `applications` + `application_roles`(物化的期望态,应用读取路径)** |
| OpenAPI schema 校验 | **zod schema**(存前校验) |
| admission webhook | reconcile 前**业务校验**(client 存在、code 唯一…) |
| `resourceVersion` 乐观并发 | **catalog 版本号**(每次 apply 递增;编辑器带走、保存比对) |
| 控制器 reconcile loop | **catalog-reconcile-service**(表 → KC client roles 对齐 + 漂移检测) |
| `kubectl get -o yaml` / GitOps | 可选 **export/import** CLI(DB ↔ YAML 文件) |
| Deployment rollout history | **`catalog_versions` 表**(谁/何时/改了啥 + 回滚) |

**数据流(apply):** 控制台/CLI 提交 YAML(+ `expectedVersion`)→ `catalog-service.apply` → parse + 三层校验 + 并发检查 → **事务**写 `applications`/`application_roles`(物化)+ 追加 `catalog_versions` + bump version → 调 `reconcile-service.ensureKeycloakRoles` → 返回 diff 报告。

**数据流(周期对账):** `reconcile-catalog` job → 读期望态(表)→ 对齐 KC client roles / 检测漂移 / 汇报滞留的 `pending_deactivate` → 日志告警。

---

## 5. 数据模型

### 5.1 沿用(不改结构)
- `applications`:`code`、`name`、`keycloakClientId`、`accessClientRole`、`status`、`loginUrl`、`adminUrl`、`webhookUrl`、`webhookSecretRef`、`metadata`。
- `application_roles`:`applicationId`、`code`、`name`、`description`、`status`;unique `(applicationId, code)`。

### 5.2 status 枚举扩展(D6)
- `applications.status` / `application_roles.status` 增加取值 **`pending_deactivate`**(既有 `active`/`inactive` 之外)。
- 语义:YAML 已移除但 DB 仍存在,待人工确认停用;**不影响已分配用户**,仅告警 + 控制台标注。
- 落地:Drizzle 声明式 schema + migration(遵循 data-layer 契约,刷新结构设计 + KingbaseES 兼容参考)。

### 5.3 新表 `catalog_versions`(审计 / 历史 / 回滚 / 并发令牌)
| 列 | 类型 | 说明 |
|---|---|---|
| `id` | pk | |
| `version` | int, unique, 单调递增 | 当前版本 = `max(version)`;即乐观并发令牌 |
| `yaml` | text | 该次 apply 的完整 YAML(secretRef 形态,无明文) |
| `diff` | jsonb | 结构化变更摘要(created/updated/pending_deactivate/kc-role-ensured) |
| `applied_by` | ref/email | 操作者 |
| `applied_at` | timestamptz | |
| `source` | enum `console\|cli\|import` | 来源 |

- **回滚** = 取某历史行的 `yaml` 重新走 apply(产生**新**版本,`diff` 记来源版本)。

### 5.4 乐观并发
- `GET /catalog` 返回 `{ yaml, version }`。
- `apply` 带 `expectedVersion`;服务端在事务内校验 `max(version) == expectedVersion`,否则 **409 CONFLICT**(= k8s `resourceVersion` 冲突)。

---

## 6. YAML schema

```yaml
version: 1
applications:
  - code: tiangong-lca                       # 必填, ^[a-z0-9-]+$, 2–50, 文件内唯一
    name: TianGong LCA 平台                   # 必填, 1–100
    status: active                           # 可选, active|inactive, 默认 active
                                             #   (pending_deactivate 为系统态,不可在 YAML 手写)
    keycloak:
      clientId: tiangong-lca-business-app    # 必填
      accessRole: tiangong_lca_access        # 必填
    webhook:                                 # 可选
      url: ${TIANGONG_LCA_WEBHOOK_URL}       # 支持 ${ENV} 插值
      secretRef: TIANGONG_LCA_WEBHOOK_SECRET # env 变量名(非明文)
    loginUrl: ${TIANGONG_LCA_LOGIN_URL}      # 可选
    adminUrl: null                           # 可选
    roles:                                   # 业务角色(不含默认 member)
      - { code: admin,         name: 系统管理员, description: TianGong LCA 系统管理员 }
      - { code: review-admin,  name: 评审管理员, description: 评审流程管理员 }
      - { code: review-member, name: 评审成员,   description: 评审成员 }
```

**校验规则(zod,对齐 `applications`/`application_roles` schema):**
- 应用 `code`:`^[a-z0-9-]+$`,2–50,文件内唯一(与现有 `applications` createSchema 一致)。
- `role.code`:**`^[a-z0-9_-]+$`**,1–50,`(app, code)` 唯一。
  - ⚠️ **既有不一致(需在实现中一并对齐):** 现有 `POST /applications/[id]/roles` 的 `createRoleSchema` 用 `^[a-z0-9_]+$`(**禁连字符**),但 `seedBusinessApps` 直插的真实角色 `review-admin`/`review-member` **含连字符**——seed 绕过 API 校验(`application_roles.code` 列仅 `text` 无 CHECK)。catalog 的正则以**真实数据**为准放开连字符;实现时应同步修正旧 `createRoleSchema`(该端点在 D7 后禁用,但保留正则一致以防回归)。
- `url` 字段:合法 URL 或 `${ENV}` 占位;`secretRef`:env 变量名格式(`^[A-Z][A-Z0-9_]*$`)。
- `${ENV}` 未定义 → apply 报错(`--check` 干跑可用 `--allow-missing-env` 放行)。
- 字段与 `seedBusinessApps` 的 `APP`/`APP_ROLES` 常量一一对应,首份 YAML 由其转写。

---

## 7. 组件(单一职责 + 接口 + 依赖)

### 7.1 `lib/catalog/schema.ts`
- **职责:** zod schema(结构 + 正则 + 长度)+ 导出类型 `CatalogDoc`/`CatalogApp`/`CatalogRole`;导出 JSON-schema(供前端 Monaco lint/补全)。
- **依赖:** zod。纯,无 IO。

### 7.2 `lib/catalog/serialize.ts`
- **职责:** tables ⇄ YAML 双向。
  - `renderToYaml(apps, roles)`:由 DB 行渲染当前目录 YAML(`secretRef` 原样;url 若源自 env 则回填 `${ENV}`)。
  - `parseYaml(text, env)`:解析 → `${ENV}` 插值(env 作参数注入)→ zod 校验 → `CatalogDoc`。
- **依赖:** `js-yaml`(**新增依赖**)、`schema.ts`。纯函数(env 注入),可单测。

### 7.3 `server/services/catalog-service.ts`
- **职责/接口:**
  - `apply(yaml, expectedVersion, actor, source) → { version, diff } | Error`
  - `getCurrent() → { yaml, version }`
  - `listVersions()` / `getVersion(id)` / `rollback(versionId, expectedVersion, actor)`
- **apply 流程:** `parseYaml` → 业务校验(§9)→ 事务开始 → 并发检查 → 计算 diff(vs 当前表)→ upsert `applications`/`application_roles` + 标记缺失为 `pending_deactivate` → 追加 `catalog_versions`(version+1)→ 提交 → 调 `reconcile-service.ensureKeycloakRoles(apps)` → 汇总返回。
- **依赖:** db(drizzle)、`serialize`、`reconcile-service`、audit。

### 7.4 `server/services/catalog-reconcile-service.ts`(controller)
- **职责/接口:**
  - `ensureKeycloakRoles(apps) → report`:每 app `findClientByClientId` → 缺失记 error(**不建 client**);ensure `accessRole` + 每个 `role.code` 对应 client role(`findRole` → 无则 `createRole`)。
  - `detectDrift() → report`:KC 缺角色 / DB `pending_deactivate` 清单。
- **依赖:** keycloak `admin-client`(`clients.find`/`findRole`/`createRole`)、db。逐 app try/catch,汇总报告。

### 7.5 控制台 UI:`app/[locale]/(admin)/apps/catalog`(或并入 apps 页)
- **职责:** Monaco YAML 编辑器(载入 `{yaml, version}`,JSON-schema lint)→ 保存 POST apply(带 version)→ 展示 diff 报告 / 校验错误(定位行/字段,编辑器带错停留,如 `kubectl edit`)→ 版本历史抽屉 + 回滚。
- 文案 **i18n 资源化**(repo 约定);权限:`app:read` 看,写操作复用现有 `app:create` + `app:update`(见 §8 与开放问题 5)。
- **依赖:** catalog API、Monaco、i18n。

### 7.6 CLI:`scripts/apply-catalog.ts` / `scripts/export-catalog.ts`
- `apply-catalog`:`pnpm apply-catalog [--file f.yaml | stdin] [--check]`。`--check` 干跑(只算 diff、校验,不写;有变更/错误时退出码非零,供 CI/pre-commit)。
- `export-catalog`:DB → YAML(stdout/文件),用于备份/GitOps/迁移;**只出 ref,不出真值**。
- **依赖:** `catalog-service`、`serialize`。

### 7.7 `server/jobs/reconcile-catalog.ts`
- **职责:** worker 周期(挂 scheduler,复用 `reconcile.ts` 模式):调 `detectDrift` + `ensureKeycloakRoles` → 日志/告警(KC 缺角色、`pending_deactivate` 滞留)。
- **依赖:** `reconcile-service`、`JobContext`。

---

## 8. API 契约

> 权限复用现有模型(`app:read`/`app:create`/`app:update`/`app:assign`/`app:revoke`),**不新造** `app:manage`。apply/rollback 横跨创建+更新+停用,故要求 `app:create` **与** `app:update`(是否引入专用 `app:manage` 见开放问题 5)。

| 方法 & 路径 | 权限 | 请求 → 响应 |
|---|---|---|
| `GET /api/admin/catalog` | `app:read` | → 200 `{ yaml, version }` |
| `POST /api/admin/catalog/apply` | `app:create` + `app:update` | `{ yaml, expectedVersion }` → 200 `{ version, diff }` / 409 CONFLICT / 422 VALIDATION(含定位) |
| `GET /api/admin/catalog/versions` | `app:read` | → `[ { id, version, appliedBy, appliedAt, source } ]` |
| `GET /api/admin/catalog/versions/:id` | `app:read` | → `{ version, yaml, diff }` |
| `POST /api/admin/catalog/rollback` | `app:create` + `app:update` | `{ versionId, expectedVersion }` → 200 `{ version, diff }` |

- **变更:** 现有 `applications`/`roles` 的 POST/PUT/PATCH 写端点 → 返回 **409/405 `CATALOG_MANAGED`**(禁用,提示改用 catalog);GET + 用户级 assignment 端点不变。遵循 api 契约 → 刷新 `openapi.yaml` + api-design。

---

## 9. reconcile / apply 行为细则

- **校验三层:** YAML 语法(js-yaml)→ 结构(zod)→ 业务(引用的 `clientId` 是否已在 KC;`code` / `role.code` 冲突;`secretRef` 的 env 是否存在——缺失警告或阻断,取决 `--check`)。
- **upsert:** `applications` 按 `code`、`application_roles` 按 `(app, code)`;更新覆盖 `name`/`keycloak`/`webhook`/`loginUrl`/`adminUrl`/`status`;YAML 缺失者置 `pending_deactivate`。
- **幂等:** 同一 YAML 重复 apply → diff 为空(见开放问题:diff 空是否 bump version)。
- **KC:** ensure `accessRole` + `roles`;client 缺失 → 该 app 记 error 但**不阻断其它 app**(逐 app 隔离)。
- **并发:** `expectedVersion` 过期 → 409;前端提示「目录已被他人更新,请重载」。
- **回滚:** 历史 yaml 走完整 apply 流程,产生新版本。

---

## 10. 错误处理

- **分层错误码:** `YAML_PARSE` / `SCHEMA_INVALID`(定位到 path)/ `BUSINESS_INVALID`(client 缺失等)/ `VERSION_CONFLICT` / `KC_ROLE_FAILED`(部分成功,报告级)。
- **事务边界:** DB upsert + `catalog_versions` 追加在一个事务;**KC 调用在事务提交后**(KC 失败不回滚 DB,记 error 入报告 + 交周期 job 补偿——KC 是最终一致的**实际态**,不是真源)。
- 逐 app try/catch,单 app 失败不影响其它 + 汇总报告。

---

## 11. 测试策略(repo 约定:真实容器 + pnpm)

- **单元(vitest):** `serialize`(tables⇄YAML、`${ENV}` 插值、非法 YAML/schema);schema 校验边界;diff 计算;pending-deactivate 判定。
- **集成(真实容器:pg + Keycloak,`deploy/docker/docker-compose.dev.yml`):** `catalog-service.apply`(create/update/pending-deactivate/并发冲突/版本+回滚);`reconcile-service` ensure KC role / client 缺失;`apply-catalog --check`。
- **e2e(playwright,可选):** 控制台编辑 → apply → diff/错误展示 → 回滚。
- 遵循 `docs/implementation/definition-of-done.md`。

---

## 12. 与现有的关系 / 迁移

- **`seedBusinessApps` 退休:** bootstrap 改为 apply 一份初始 catalog YAML(`config/business-apps.yaml`,由现有 `APP`/`APP_ROLES` 常量转写);保留薄封装或直接 CLI。
- **现有 tiangong-lca 登记**([plan 2026-07-03](./2026-07-03-tiangong-lca-app-registration.md))数据不变,改由 YAML 表达;首份 YAML 以其字段为准(`code=tiangong-lca`、`tiangong-lca-business-app`、`tiangong_lca_access` 等**逐字契约不变**)。
- admin 目录写端点禁用(D7);读 + assignment 不变。
- **审批流**(注册 → 审批 → 准入/角色 grant)完全不变。

---

## 13. 安全

- YAML 无明文密钥(D3),只放 `secretRef`;`serialize` 渲染时对 `webhook.secretRef` 只输出 env 名。
- catalog 写端点 `app:manage` 权限;所有 apply/rollback 记 audit(actor + diff + version)。
- `catalog_versions.yaml` 落库前扫描:若检出疑似明文密钥(`secretRef` 值不是合法 env 名而像密文)→ 阻断 + 提示。
- `export-catalog` 同样只出 ref,不出真值。

---

## 14. 落地阶段(建议;供 writing-plans 切分)

- **P1(MVP):** `schema` + `serialize` + `catalog-service`(apply/getCurrent/版本/并发)+ `catalog_versions` 表 + status 扩展 + `apply-catalog` CLI + `reconcile-service`(ensure KC role)+ 单/集成测。首份 YAML 取代 seed。
- **P2:** 控制台 Monaco 编辑器 + 版本历史/回滚 UI + `app:manage` 权限 + 禁用旧写端点。
- **P3:** worker 周期对账 job + `export-catalog` + 明文密钥扫描 + e2e。

---

## 15. 开放问题 / 风险

1. **无变更 apply 是否 bump version:** 倾向 diff 空则不 bump、不追加,返回当前 version(待定)。
2. **`pending_deactivate` 的「人工确认停用」入口:** 控制台单独动作 or CLI(P2/P3 细化)。
3. **KC client role 删除:** YAML 移除某业务角色 → 目前只标 `pending_deactivate`(DB),KC client role **不自动删**(与 D2 一致),留待人工——记录为约束。
4. **多环境(dev/prod):** 当前走单文件 + `${ENV}` 插值,多环境靠 env 值差异;若需分文件后续扩展。
5. **catalog 写权限:** 默认复用 `app:create` + `app:update`(要求二者同时具备);是否值得引入专用 `app:manage` 权限(更清晰但触及权限模型/RBAC 文档)——待定,倾向先复用不新造。

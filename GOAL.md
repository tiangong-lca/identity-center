---
docType: goal-contract
scope: repo
status: active
authoritative: true
owner: identity-center
language: zh
whenToUse: 需要确认统一身份平台一期的交付目标、范围边界或完成定义时阅读本文档。
whenToUpdate: 交付目标、范围边界或完成定义(§7)发生变化时更新本文档。
checkPaths:
  - GOAL.md
  - docs/implementation/README.md
  - docs/implementation/definition-of-done.md
lastReviewedAt: 2026-07-07
lastReviewedCommit: cbf5737
---

# GOAL — 统一身份平台一期全量交付

> 本文档是交给 Claude Code 的执行目标书。目标:从当前零应用代码状态出发,完整实现、测试并端到端交付统一身份平台一期(non-MVP,设计目标态全量),直至满足本文"完成定义"的全部条目。

## 1. 使命

按已评审通过的设计文档集,构建 Keycloak + Next.js 统一身份平台:统一登录/SSO、注册审批、用户/应用/准入/角色管理、事件同步管道、审计,并完成首个业务应用(Supabase)接入。交付物是可上线运行的系统,不是原型或最小可用版本。

**开发模式:全部开发、测试、文档与交付由 Claude Code 自主完成。人不参与编码、不做评审门禁;人的唯一介入通道是 issue(需求、缺陷、阻塞裁决),处理规则见 §5 第 6 条。**

## 2. 权威输入与冲突裁决

| 输入 | 位置 | 作用 |
|---|---|---|
| 设计文档集(12 篇) | `docs/design/` | 架构与行为的最高依据 |
| 实施方案 | `docs/implementation/README.md` | 实施顺序、范围、验收标准、工作方式 |
| 高保真原型(15 页) | `identity-platform-admin/pages/*.html` | 页面布局与交互依据 |
| 设计库 | `.design_library/identity-platform/` | tokens、主题、组件规范、图标 |

裁决顺序:**架构与行为语义以设计文档为准;实施顺序、范围与新增需求(i18n、主题、双库)以实施方案为准;视觉以原型与设计库为准。** 发现设计缺口或文档间矛盾时:在 `docs/implementation/decisions.md` 记录问题、选项与所做决定后继续推进;涉及安全语义或数据模型的重大矛盾,则按 §5 第 6 条创建阻塞 issue 提请人裁决,期间继续不受影响的工作。

## 3. 交付范围(全量,不裁剪)

- [ ] 基础设施:Docker Compose 开发/生产环境(PostgreSQL、KingbaseES、Keycloak、Redis、RabbitMQ、Mailpit),Keycloak realm 可脚本重建并导出
- [ ] 数据层:20 张表(见实施方案 §3.3)的 Drizzle schema + migrations + seed,**PostgreSQL 与 KingbaseES 双库实测通过**
- [ ] 基础能力:auth(OIDC)、keycloak admin-client、http(13 错误码/requestId)、permissions(三层 RBAC + 继承)、audit(hash chain)、mq adapter(RabbitMQ 实现)、crypto(AES-256-GCM PII 加密)、rate-limit、csrf、config、validation、i18n 辅助
- [ ] 服务与任务:全部业务 service(用户/应用/准入/应用角色/注册审批/组织与映射/租户[配置启用]/管理 RBAC/审计) + 7 个后台任务(outbox 派发、Keycloak 投影、Webhook 投递、3 类对账、死信重试),事实表 + outbox 同事务写入
- [ ] 接口层:约 57 个端点(`/api/admin|public|account|internal`),统一 CSRF/权限/审计/幂等/分页接线,OpenAPI 3.0 契约
- [ ] 页面层:约 24 个页面对照原型实现;**多语言 zh-CN(默认)+en 全文案资源化;light/dark/system 三态主题**映射设计库 token;Keycloak 登录/注册页主题定制(双语)
- [ ] Supabase 接入:SSO、`resource_access` 准入校验、Webhook 消费(签名+幂等)、`keycloak_sub` 本地映射、存量用户盘点绑定、撤权生效验证
- [ ] 安全与运维:安全清单 17/17、PII 列加密、验证码开关、备份+恢复演练、监控告警、生产 compose、5 份 runbook、break_glass 预案

## 4. 硬性约束(架构不变量,违反即返工)

1. **技术栈锁定**:Next.js App Router、Auth.js(Keycloak Provider)、React + Tailwind + shadcn/ui、TanStack Query + React Hook Form + Zod、Drizzle ORM、PostgreSQL/KingbaseES、BullMQ + Redis、RabbitMQ(经 `lib/mq` adapter)、next-intl、next-themes、Docker。不引入 Redux 等设计外重型依赖。
2. **身份键**:跨系统唯一身份键是 `keycloak_sub`;`keycloak_user_id` 仅用于 Admin API 操作;禁止用 email 做身份关联。
3. **事实源边界**:`application_assignments` 是准入事实源,Keycloak Client Role 只是认证侧投影;Keycloak Group 不作准入事实源。Keycloak Realm Role 只有 `admin_console_access`、`platform_admin`、`break_glass_admin` 三个。
4. **一致性语义**:用户禁用以 Keycloak disable 成功为完成点;准入撤销以 Keycloak Client Role 移除成功为完成点(响应语义 200/202/409/502/424);授权/资料走最终一致(Outbox→MQ→Worker→对账)。
5. **安全红线**:secrets/service token/DB 连接串不进浏览器;所有管理接口服务端三层校验(入口/Service/UI 仅体验);高风险操作二次确认+审计;审计 append-only + hash chain;Keycloak 不可用时降级"仅拒绝不放行"。
6. **密码与 MFA 全部由 Keycloak 承载**,Next.js 不落任何凭据,不成为第二套认证系统。
7. **双库兼容(KES 非阻塞,见 decisions.md D-001)**:PostgreSQL 为一等公民必须实测;KingbaseES 兼容通过三件套保障——禁止核心路径使用 PG 专有特性(约定文档)、`lib/db` thin adapter(连接可切换)、参数化双库测试矩阵(`KES_ENABLED=1` 一键补验)。KES 实测在环境可得后补做,不阻塞交付,但三件套缺一不可。
8. **目录与依赖边界**:按 `docs/design/02-application/04-project-structure-design/` 的分层与禁止依赖方向执行,并用 ESLint 规则固化。
9. **API 约定**:响应 `{data|error, requestId}`;DB snake_case,JSON camelCase;列表统一 `page/pageSize/keyword/sort/order/filters`;写操作支持 `Idempotency-Key`。

## 5. 工作方式(过程要求)

1. **先查证后实现**:引入/升级任何库、编写关键集成前,优先用 Context7 查询该库当前文档;覆盖不足时网络搜索官方文档与成熟实践。禁止凭记忆写可能过时的 API。查证结论(版本、选用 API、坑)记录到 `docs/references/`。
2. **测试驱动**:每层的验收标准写成可执行测试再实现;集成测试对 compose 起的真实容器运行,不用 mock 替代 Keycloak/DB/MQ 行为验证。
3. **按层推进,层内完成再进下一层**:执行顺序 L0→L7(见 §6);每层完成:全部该层测试绿 → git commit → 更新 `docs/implementation/README.md` §9 进度表(日期 + commit)。
4. **文案与主题从第一行代码起资源化**:UI 字符串一律进 i18n messages,颜色一律走主题 token,避免后期返工。
5. **诚实报告**:测试失败、KingbaseES 镜像不可得、Keycloak 行为与文档不符等,如实记录并处理,不粉饰跳过。
6. **issue 驱动协作**:人只通过 issue 介入。渠道:仓库配置 GitHub remote 时用 GitHub Issues(`gh` CLI),否则用仓库内 `docs/issues/NNN-<slug>.md`(状态 open / in-progress / resolved)。AI 在开工时与每层完成时检查 issue,按类型处理:缺陷(复现 → 修复 → 测试 → 在 issue 回执证据)、需求(评估对范围与 §4 不变量的影响,记录 `docs/implementation/decisions.md` 后排入计划)、裁决答复(解除对应阻塞项)。AI 需要人裁决时,同样以 issue 提出。

## 6. 执行顺序(细节见实施方案 §5)

| 层 | 内容 | 出口标准(摘要) |
|---|---|---|
| L0 基础设施 | compose(全服务含 KES)、Keycloak bootstrap+realm 导出、Next.js 骨架(含 i18n/theme 底座)、CI | compose 一键起全绿;realm 可重建;骨架可切换语言/主题;CI 绿 |
| L1 数据层 | 20 张表 schema+migrations+seed、repositories、双库测试矩阵 | 迁移+repository 测试**双库全绿**;seed 幂等 |
| L2 基础能力 | lib/ 全模块(auth/keycloak/http/permissions/audit/mq/crypto/rate-limit/i18n...) | OIDC 登录冒烟通过;admin-client 集成测试绿 |
| L3 服务与任务 | 全部 services/policies/jobs、outbox 事务、幂等、对账 | 禁用/撤权/事件端到端/故障演练集成测试绿;核心链路双库绿 |
| L4 接口层 | ~57 端点、统一接线、速率限制、OpenAPI | 全端点契约测试绿;每写操作有审计;撤权 5 态正确 |
| L5 页面层 | 24 页 + i18n 全量 + 双主题 + Keycloak 登录主题 | 对照原型走查(双主题双语);e2e 四流程+切换冒烟绿 |
| L6 联调与接入 | 全链路演练、Supabase 接入、存量用户映射 | 接入验收 10/10;撤权后业务侧拒绝;抽样登录无错绑 |
| L7 加固与上线 | 安全 17 项、PII 加密、备份演练、监控、prod compose、runbook、双库终验 | 完成定义(§7)全部满足 |

## 7. 完成定义(Definition of Done)

以下全部满足才算交付完成,逐项提供证据(命令输出/测试报告/文档链接):

1. `docker compose -f deploy/docker/docker-compose.dev.yml up -d` 后所有服务健康;`scripts/bootstrap-keycloak-realm.ts` 可从零重建 realm。
2. 数据库迁移在 **PostgreSQL** 上从零执行成功且集成测试全绿;KES 侧交付"兼容约定文档 + thin adapter + 参数化矩阵(`KES_ENABLED=1` 可跑)",实测状态如实记录于 `docs/references/kingbasees-environment.md`(D-001:非阻塞)。
3. 质量门:lint、typecheck、unit、integration、contract 测试全部通过;Playwright e2e 通过(登录、用户禁用、准入授予/撤销、注册审批、语言切换、主题切换)。
4. 端到端演示通过并录入文档:注册 → 审批 → 开通 → 准入 → 角色 → 同步 → 用户登录 Supabase 应用;随后撤权,用户被业务侧拒绝,对账无差异。
5. 全部 UI 在 zh-CN/en 与 light/dark 下无硬编码文案、无主题遗漏(抽查 + ESLint 规则证明)。
6. OpenAPI 契约生成并与实现一致;每个管理写操作产生审计记录(测试断言)。
7. 安全评审清单 17/17 逐项留档(`docs/references/`);PII 字段加密落地;速率限制与 CSRF 生效(测试证明)。
8. 备份脚本可执行且恢复演练成功一次(记录留档);监控告警配置就位;5 份 runbook 存在于 `deploy/runbooks/`。
9. `docker-compose.prod.yml` 可完成生产形态部署(HTTPS/secrets 注入说明齐备)。
10. `docs/implementation/README.md` §9 进度表 8 层全部标记完成并附对应 commit;所有工作已提交 git。

## 8. 边界与禁区

- 不实现具体国产 MQ connector(仅 adapter 契约 + RabbitMQ 实现)。
- 不拆 Monorepo、不拆独立 Worker 部署(保持可拆边界)。
- 不为租户发明设计外的 API/页面(表与 service 支持 + 配置启用即可)。
- 不执行 Supabase 之外旧系统的迁移(能力与文档沉淀即可)。
- 不修改 `docs/design/` 下的设计文档内容;缺口与决定记录在 `docs/implementation/decisions.md`。
- 不跳过或弱化 §4 的架构不变量与 §7 的完成定义;做不到就如实报告阻塞。

## 9. 受阻与恢复规则

- **受阻**(如 KingbaseES 镜像不可得、Supabase 环境缺失、Keycloak 版本行为差异):记录到 `docs/implementation/decisions.md`,并按 §5 第 6 条创建阻塞 issue,给出候选方案与建议供人裁决;其余不受影响的工作继续,不空转等待。
- **中断恢复**:以 git log + 进度表(§9 of 实施方案)定位当前层,从该层验收标准的未通过项继续;任何时候仓库应处于"上一层全绿"的稳定状态。

# 实施决策记录

> 按 GOAL.md §2:实施中发现的设计缺口、矛盾与用户裁决在此记录。

## D-006 next-auth beta.32 安全例外与验证(2026-09-14)

用户明确批准本次从 `next-auth 5.0.0-beta.31` 升至 `5.0.0-beta.32`；这是对稳定版本规则的单次例外，不是审计豁免。beta.32 精确依赖修复版 `@auth/core 0.41.3`，声明的 peers 兼容现用 Next16.3.5 / React19.2.4；nodemailer peer 范围增加 `^8.0.5`。未增加 overrides 或改变认证架构。当前审计为0 critical、0 high、15 moderate、4 low；待兼容的 Auth.js v5 稳定版出现后重新评估，保留现有 moderate/low 的适用性记录。

独立验证通过 frozen install、lint、typecheck、80个单元测试、105个全量未过滤集成测试及已有 build。SMTP测试创建独立临时 realm，固定使用本地 Mailpit，按唯一收件人验证邮件并严格清理；不清空共享邮箱、不修改共享 realm。保留 `KC_SMTP_HOST` 或 `SMTP_TEST_ENABLED=1` 两种启用方式。URL校验在启用后的beforeAll内执行，拒绝非本地、畸形、带凭据或query/hash的地址且不回显输入；网络或HTTP错误直接失败，正常收件等待仍有15秒上限。

真实浏览器验证覆盖 OIDC登录、退出后重新要求凭据、再次登录。既有 `/login` 会自动提交，退出action也直接重新发起OIDC；测试改为等待这些真实导航，消除点击已卸载中间页按钮的竞态，没有改动产品行为。验证使用新建的本地已激活测试管理员，完成后删除其Keycloak用户和数据库角色/镜像记录；共享种子管理员的首次改密要求保持原样。默认种子账号仍须按原有首次登录流程激活，不能把这次测试解释为取消该要求。

初次邮件补丁的URL拼接错误已修复，撤回未经证实的“投递延迟”解释和超时膨胀。初次长浏览器验证后的测试清理遇到master token刷新上下文问题，随后用新master会话删除了精确临时账号并验证无残留；后续验证及清理均成功。生产身份、realm/catalog导出、业务数据和部署配置未改变。当前事实见Issue17的验证记录；历史依赖检查点保留于[版本记录](../references/2026-07-02-l0-dependency-versions.md)。

## D-005 注册申请选择应用与角色实施口径(2026-07-03,workspace 决策 D7,设计 §4.6)

**背景**:注册链路原为 门户 `/register` 表单 → `POST /api/public/registration-requests` → 审批 → 开通;准入与角色分配是审批后的独立管理动作,申请单本身不携带目标应用/角色。workspace 设计追加指示(D7,§4.6):允许申请人在提交注册申请时一并选择目标应用与角色(多应用、每应用至多一角色、角色可不选)。以下为 identity-center 侧实施口径,按设计 §4.6 四条要点落地:

1. **申请单快照,软引用,提交时双层校验**:`registration_requests` 新增 `requested_access` jsonb 列,结构 `[{ applicationCode, roleCode? }]`,与 `requestedOrganizationId` 同为软引用——申请记录不受应用/角色后续生命周期变化约束。校验在 `registration-service.submit` 内完成、不依赖前端表单约束:先经 zod(`requestedAccessSchema`)校验形状(`applicationCode` 格式、`roleCode` 可选、数组长度上限 20、`applicationCode` 去重),再查库校验存在性(`validateRequestedAccess`):应用必须存在且 `active`;`roleCode`(若填)必须属于该应用且 `active`。任一项不合法则整单拒绝(`VALIDATION_ERROR`),不做部分接受。
2. **公共目录端点**:新增 `GET /api/public/applications`,返回 active 应用及其 active 角色的 `code`/`name`,供注册页渲染选择项;复用公共端点既有 IP 限流(scene=`catalog`)。应用/角色名的公开可枚举性经设计评审接受为非敏感信息。
3. **审批通过后自动授予,逐项失败容忍,不回滚开通**:开通编排在建 Keycloak 用户 + `portal_users` 事务提交之后,对 `requested_access` 逐项依次调用既有 `assignment-service.grant`(source=`registration`)与 `app-role-assignment-service.assign`(source=`registration`)——事件出站、Keycloak 投影、审计写入全部走正常管道,不新增旁路。每项的准入(admission)与角色(role)结果分属独立 try/catch:角色环节失败绝不回改已成功/已跳过的准入结果,反之亦然;`CONFLICT`(已有等价准入/分配)视为良性 `skipped`,不计入失败。单项或多项失败(应用已下线、角色已失效等)**不回滚账号开通**,与平台"事实成立、投影最终一致"的既有语义一致;结果逐项体现在审批响应的 `grants` 数组(`{applicationCode, admission: granted|skipped|failed, role?: assigned|failed, error?}`)与准入/角色列表中,由既有重试/对账机制兜底。审计写入本身失败时只记日志、不抛出,避免已经成功落地的开通与授予被误报为 500。
4. **审批动作本身不做改派**:审批人如需调整申请人实际获得的应用/角色(增补、更换、撤销),在开通完成后通过既有用户详情页/准入管理页操作;审批通过这一动作只按申请快照执行既定的自动授予,保持审批流程简单、可预测。
5. **UI**:`/register` 表单增加应用多选(checkbox)+ 每个已选应用的单角色下拉(角色可留空 = 仅申请准入,取应用默认标准身份);目录加载失败不阻塞基本注册提交。审批详情弹窗展示申请人所选应用/角色快照。

对 lca-platform(tiangong)侧无新增契约要求:授予产生的 `access.application.granted` 与 `application.role.assigned` 事件按既有 §4.4/§4.5 契约消费。

依据:carbon-workspace/_docs/plans/2026-07-03-lca-platform-identity-center-integration-design.md §4.6。

## D-004 首个业务应用登记更名为 tiangong-lca(2026-07-03,workspace 决策 D4)

Supabase 占位登记(code=supabase)更名为真实应用 tiangong-lca(client=tiangong-lca-business-app,role=tiangong_lca_access,env=TIANGONG_LCA_*)。
Redirect URI 语义修正:RP 是 GoTrue,指向 <SUPABASE_URL>/auth/v1/callback。PKCE 属性处理结论见 docs/references/2026-07-03-gotrue-keycloak-federation.md。
角色目录(admin/review-admin/review-member)随 seed 登记,互斥单角色为管理约定。role 事件 payload 补 applicationCode。
依据:carbon-workspace/_docs/plans/2026-07-03-lca-platform-identity-center-integration-design.md。

## D-003 邮箱验证与 SMTP 转为可选,默认关闭(2026-07-02,用户裁决)

**背景**:用户实测发现两个问题:(1)新开通账号首次登录报"send email fail"——realm `verifyEmail=true` + 开通账号 `emailVerified=false` 触发验证邮件,而 realm SMTP host 配为 `localhost`(容器内指向 Keycloak 自身)不可达;(2)门户登出后再登录免密直入——缺 Keycloak 侧 federated logout。调查后用户裁决:**当前环境默认不需要 SMTP、无需邮箱验证**。

**执行口径**:

1. **邮箱验证开关** `KC_VERIFY_EMAIL`(默认关):`lib/config/email.ts`;关闭时 realm `verifyEmail=false` 且**不配置 SMTP**(`smtpServer: {}`),开通账号(管理员新建/注册审批通过)直接 `emailVerified=true`,登录零邮件依赖。
2. **开启方式**:`KC_VERIFY_EMAIL=true` + `KC_SMTP_HOST`(Keycloak 容器可达地址,dev 为 `mailpit`,不能用 `localhost`)后重跑 bootstrap;此时开通账号 `emailVerified=false` 走验证流。
3. **VERIFY_PROFILE 禁用**:用户资料是平台侧事实(`portal_users.display_name`),Keycloak 默认 user profile 的 lastName 必填会把首登用户卡在"更新账户信息"页,bootstrap 中禁用该 required action。
4. **登出两层化**:`signOut` 事件回调调用 Keycloak end-session(`id_token_hint`)终止 SSO 会话,登出后再登录必须重新认证。
5. **回归测试**:`realm-config` 单测(SMTP 可选/verifyEmail 开关)、`keycloak-email` 集成套件(默认 skip,配 SMTP 时启用)、`first-login` e2e(临时密码→改密→直达门户)、`logout` e2e(登出后不免密)。
6. **存量用户修复(补充,2026-07-02 二次报障)**:realm 开关不清除用户身上已挂的 `VERIFY_EMAIL` required action,历史账号登录仍尝试发邮件失败。bootstrap 在邮件关闭模式下执行幂等 sweep(`scripts/keycloak/remediate-email-state.ts`):存量用户统一 `emailVerified=true` 并剥离邮件依赖动作;同时**无 SMTP 时关闭自助找回密码**(`resetPasswordAllowed` 跟随 SMTP 配置,登录页不再出现"忘记密码"死链,密码重置由管理员兜底)。集成回归:`remediate-email-state.test.ts`。

## D-002 注册入口口径修正(2026-07-02)

**发现**:实现初期开启了 Keycloak 自助注册(registrationAllowed=true,登录页"注册账号"链接),但未搭配"注册后进平台审批"的桥接——用户可绕过审批直接建号,违反核心设计原则"注册默认需管理员审批";且门户缺少 /register 表单页,公共申请 API 无用户入口。

**修正**:关闭 Keycloak 自助注册;新增门户 `/register` 申请页(表单 → `POST /api/public/registration-requests` → 审批队列),登录页加"提交注册申请"入口。注册链路统一为:**申请 → 管理员审批 → 开通(建 KC 用户,临时密码)→ 准入/角色分配**。设计的"模式 A(KC 托管注册+审批桥)"如未来需要,可在补齐审批桥后再评估开启。

## D-001 KingbaseES 双库实测降级为非阻塞(2026-07-02,用户裁决)

**背景**:L0 阶段验证 KES 开发环境时,官方无 Docker Hub 镜像(官网 tar 包需手动下载),社区镜像(`warm3snow/kingbase:v8r6` arm64 / `huzhihui/kingbase:v8r6` amd64)因网络原因拉取困难,阻塞 L0 收尾。

**用户裁决**:KingbaseES 只是兼容数据库选择之一,**不作为 GOAL.md 推进的 blocker**;开发过程预留 thin adapter,完成 GOAL.md 除 kingbase 之外的所有任务。

**执行口径**:

1. PostgreSQL 为一等公民,全部测试以 PG 为准。
2. **thin adapter 预留**:`lib/db` 数据库客户端经连接工厂创建(连接串可配置);KES 走 PostgreSQL 兼容模式同一 `pg` 驱动,切换仅需 `KINGBASE_URL`。集成测试矩阵参数化(env 开关 `KES_ENABLED=1` 时同套测试跑 KES),环境可得后一键补验。
3. **兼容约定继续强制执行**:核心路径禁用 PG 专有特性(约定文档随 L1 交付,code review 检查项)。
4. compose 中 `kingbase` 服务(profile `kes`)保留,镜像可得后直接使用。
5. GOAL.md DoD 第 2 条(双库实测)调整为:PG 必须实测;KES 为"约定 + adapter + 参数化矩阵就绪",实测在环境可得后补做,不阻塞交付。

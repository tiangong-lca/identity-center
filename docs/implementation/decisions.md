# 实施决策记录

> 按 GOAL.md §2:实施中发现的设计缺口、矛盾与用户裁决在此记录。

## D-003 邮箱验证与 SMTP 转为可选,默认关闭(2026-07-02,用户裁决)

**背景**:用户实测发现两个问题:(1)新开通账号首次登录报"send email fail"——realm `verifyEmail=true` + 开通账号 `emailVerified=false` 触发验证邮件,而 realm SMTP host 配为 `localhost`(容器内指向 Keycloak 自身)不可达;(2)门户登出后再登录免密直入——缺 Keycloak 侧 federated logout。调查后用户裁决:**当前环境默认不需要 SMTP、无需邮箱验证**。

**执行口径**:

1. **邮箱验证开关** `KC_VERIFY_EMAIL`(默认关):`lib/config/email.ts`;关闭时 realm `verifyEmail=false` 且**不配置 SMTP**(`smtpServer: {}`),开通账号(管理员新建/注册审批通过)直接 `emailVerified=true`,登录零邮件依赖。
2. **开启方式**:`KC_VERIFY_EMAIL=true` + `KC_SMTP_HOST`(Keycloak 容器可达地址,dev 为 `mailpit`,不能用 `localhost`)后重跑 bootstrap;此时开通账号 `emailVerified=false` 走验证流。
3. **VERIFY_PROFILE 禁用**:用户资料是平台侧事实(`portal_users.display_name`),Keycloak 默认 user profile 的 lastName 必填会把首登用户卡在"更新账户信息"页,bootstrap 中禁用该 required action。
4. **登出两层化**:`signOut` 事件回调调用 Keycloak end-session(`id_token_hint`)终止 SSO 会话,登出后再登录必须重新认证。
5. **回归测试**:`realm-config` 单测(SMTP 可选/verifyEmail 开关)、`keycloak-email` 集成套件(默认 skip,配 SMTP 时启用)、`first-login` e2e(临时密码→改密→直达门户)、`logout` e2e(登出后不免密)。

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

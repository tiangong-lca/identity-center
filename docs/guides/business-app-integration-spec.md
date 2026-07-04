# 业务应用接入技术规范（Business-App Integration Spec）

> 面向**要接入统一身份平台（Identity Center，IC）的业务应用开发团队**。
> 本文回答一个问题:**要接入 IC，业务应用自己需要设计和实现哪些 API、契约与数据模型?**
> 配套文档:[业务应用接入指南](./business-app-onboarding.md)(流程/十步)、[总体架构设计 §12](../design/01-architecture/01-overall-architecture/README.md)(权威依据)。
> **本规范应用无关(app-agnostic)**:正文一律用 `<app>` 等占位符表述,适用于任何接入的业务应用。通用可复用参考见 IC 仓 `identity-portal/lib/business-app-kit/`;一份完整的接入工作样例(首个接入应用)见 [§7 参考实现](#7-参考实现)。

---

## 0. 一句话职责边界

| 平台(IC)负责 | 业务应用负责 |
|---|---|
| 账号真身(Keycloak)、**是否可进入某应用**(准入)、**在应用中是什么角色**(角色目录 + 分配)、下发事件 | 校验平台签发的凭据、**消费平台事件**、维护本地用户映射、把平台角色投影为**本地权限/资源级控制/业务审计** |

**跨系统身份键恒为 Keycloak `sub`(`keycloak_sub`),绝不用 email。** email 可变、可重复、可被伪填,不能作主键。

业务应用需要对外/对内提供的东西只有两类:
1. **一个 OIDC 客户端 + 一道"登录门"**(校验 token 的准入);
2. **一个 Webhook 接收端点**(消费平台事件,做本地投影)。

其余都是本地实现细节。下面逐条给契约。

---

## 1. 接入前置:在 IC / Keycloak 侧登记(一次性)

| 步骤 | 内容 |
|---|---|
| Keycloak Client | `<app>-business-app`,**confidential**,Standard Flow,PKCE S256;Redirect URI / Web Origins 填应用实际域名 |
| 准入 Client Role | `<app>_access` —— 平台"准入"投影的目标角色 |
| 业务角色目录 | 在 IC `application_roles` 登记**应用自定义的业务角色**(由应用自行定义,如 `admin` / `reviewer` / `member` 之类),供注册申请页勾选、审批分配 |
| 平台登记应用 | 在 IC `applications` 写入:`code`、`keycloakClientId`、`accessClientRole`、`webhookUrl`、`webhookSecretRef`(参考 `scripts/seed/business-apps.ts`) |

> `webhookSecretRef` 是**环境变量名**而非明文;平台投递时按该名解析密钥。业务应用侧必须持有**同一个密钥**用于验签(见 §3)。

---

## 2. 契约一:SSO 登录 + 登录门(应用必须实现)

### 2.1 集成 OIDC

- issuer = `${KEYCLOAK_BASE_URL}/realms/<realm>`(如 `company-dev`);用 Auth.js Keycloak Provider 或任意标准 OIDC 库。
- 登录成功后,应用需拿到 Keycloak 签发的 **access token(即 `provider_token`)**——**准入判定基于它,而不是应用自己的会话 token**。

### 2.2 登录门:token 校验契约(**这是准入的唯一判据**)

应用后端在建立本地会话前,必须对 Keycloak token 做:

1. **验签**:用 realm JWKS(`${issuer}/protocol/openid-connect/certs`)验 RS256 签名;
2. **验 `iss`** 等于本 realm issuer;
3. **验归属**:`azp`(或 `aud`)包含本应用的 `keycloakClientId`;
4. **验 `exp`** 未过期;
5. **验准入角色**:`resource_access["<app>-business-app"].roles` **必须包含 `<app>_access`**。

判定结果与状态码(**契约固定**):

| 情况 | 返回 |
|---|---|
| 无 token / 无法解析 / 验签失败 | **401 `UNAUTHENTICATED`** |
| token 有效但缺准入角色 | **403 `APP_ACCESS_DENIED`** |
| 通过 | 200,建立本地会话 |

**参考实现**(可直接抄):`identity-portal/lib/business-app-kit/verify-access.ts` 的 `checkApplicationAccess(token, clientId, accessRole)` → `{ allowed, code, reason }`。

### 2.3 防挪用(推荐)

若应用侧存在"本地用户 ↔ keycloak_sub"映射,登录门应校验**当前会话用户的 keycloak 身份 `sub` 等于 token 的 `sub`**,防止用他人 token 越权。

### 2.4 SPA / 前端集成的三个坑(实战教训,务必看)

1. **`openid` scope 必带**:发起 OAuth 时 scope 要含 `openid`,否则平台取 userinfo 失败。
2. **需要 `provider_token`**:准入判定要的是 Keycloak 的 token。若用 Supabase/GoTrue 这类中间层,**用 implicit 流程**(`flowType: 'implicit'`),让 `provider_token` 随 URL fragment 返回;PKCE 默认不可靠地暴露 `provider_token`。
3. **hash 路由冲突**:若应用是 hash 路由(`#/...`),OAuth 回调的 `#access_token=…` 会与路由 hash 形成**双 `#`**,标准库解析不出 session。需**自行从 `window.location.hash` 提取 token 并显式 setSession**。(完整范例见 [§7](#7-参考实现)。)

---

## 3. 契约二:Webhook 接收端点(应用必须实现的 API)

平台通过 Webhook 把"用户/准入/角色"的变更推给业务应用。**这是业务应用唯一必须对外暴露、需要自己设计实现的 HTTP API。**

### 3.1 端点

- 方法:**POST** `<webhookUrl>`(登记在 IC `applications.webhookUrl`)。
- 认证:**不带平台 JWT**,**靠签名认证**。端点必须可被平台网络访问;若在网关后,确保该路由**不强制 JWT**(如 Supabase 的 `verify_jwt=false`)。

### 3.2 请求头

| 头 | 含义 |
|---|---|
| `content-type` | `application/json` |
| `x-webhook-event-id` | 事件唯一 id(**幂等键**) |
| `x-webhook-event-type` | 事件类型(见 §3.5) |
| `x-webhook-timestamp` | Unix 秒;需在 **±300s** 时间窗内 |
| `x-webhook-signature` | `sha256=base64(HMAC-SHA256(secret, timestamp + '.' + rawBody))` |

### 3.3 验签(**先验签,后产生任何副作用**)

```
message  = `${x-webhook-timestamp}.${原始请求体字符串}`
expected = "sha256=" + base64( HMAC_SHA256(secret, message) )
require: timingSafeEqual(expected, x-webhook-signature)
require: |now - x-webhook-timestamp| <= 300s
```

- 用**原始 body 字节**参与签名,勿先反序列化再重序列化(会改字节)。
- 用**恒定时间比较**(timing-safe)。
- **参考实现**:`identity-portal/lib/business-app-kit/verify-webhook.ts` 的 `verifyPlatformWebhook({ secret, signature, timestamp, rawBody })`;签名算法 `lib/sync/webhook-signature.ts`。

### 3.4 幂等 + 响应契约(决定平台是否重试)

- **按 `x-webhook-event-id` 去重**(建议持久化一张 `processed_events(event_id) UNIQUE`;更稳的是用**被签名保护的** `envelope.eventId`)。
- 响应语义:

| 返回 | 平台行为 |
|---|---|
| **2xx** | 视为已确认(ack),不重试 |
| **非 2xx / 超时** | 触发重试:**1s → 5s → 30s → 2min → 10min**,共 **5 次**;5 连败进**死信**告警 |

因此实现要点:
- **验签失败** → 返 **401**(平台不会因坏签名反复重试你);
- **验签通过但 body 畸形 / 事件与本应用无关 / 不关心的类型** → 返 **2xx(ignored)**,别让平台空转重试;
- **处理中途 DB/依赖故障** → 返 **5xx**(让平台重试);若已写幂等记录,记得回滚该记录以便重试能重入。

### 3.5 事件矩阵(平台会发的 12 种,及建议的本地动作)

Envelope(JSON body)通用字段:`eventId`、`eventType`、`eventVersion`、`occurredAt`、`keycloakSub`、`applicationCode`;角色类事件另带 `roleCode`、`scopeType`、`scopeId`;资料类带 `displayName`。

| eventType | 语义 | 业务应用建议动作 |
|---|---|---|
| `identity.user.created` | 平台建号 | (可选)预建本地映射占位 |
| `identity.user.updated` | 资料变更 | 同步 displayName 等 |
| `identity.user.disabled` | 账号停用 | **封禁**本地访问 |
| `identity.user.enabled` | 账号启用 | 解封 |
| `identity.user.deleted` | 账号删除 | 标记删除、封禁 |
| `identity.user.logout` | 强制登出 | **吊销会话**(有界残余窗见 §5) |
| `access.application.granted` | 授予本应用准入 | 标记该用户对本应用 `active` |
| `access.application.revoked` | 撤销准入 | **标记 revoked + 封禁** |
| `access.application.expired` | 准入过期 | 同 revoked |
| `application.role.assigned` | 分配业务角色 | 设 `desired_role = roleCode` |
| `application.role.updated` | 变更业务角色 | 同 assigned |
| `application.role.revoked` | 撤销业务角色 | 清空/降级 `desired_role` |

**要点**:`access.application.*` / `application.role.*` 事件带 `applicationCode`,**先过滤只处理本应用**;`application.role.*` 仅处理 `scopeType='global'`(除非应用设计了 scope 化角色)。事件是**至少一次、可能乱序**——用 `keycloak_sub` 幂等收敛到"期望状态",别假设顺序。

---

## 4. 数据模型要求(业务应用本地)

至少两张表(命名自定):

```
app_users(
  keycloak_sub  text PRIMARY KEY,   -- 跨系统身份键,唯一;绝不用 email
  local_user_id ...,                -- 本地用户/会话主键,首登时回填
  status        text,               -- active|disabled|revoked|deleted
  desired_role  text,               -- 由 role.* 事件维护;登录/对账时投影为本地权限
  ...
)
processed_events(
  event_id text PRIMARY KEY,        -- webhook 幂等去重
  ...
)
```

- 首次 SSO 登录时,把 `local_user_id` 与 `keycloak_sub` 绑定。
- **登录门通过后的本地物化写入若失败,应返回可重试错误(如 503),不要静默放行成功**——否则用户"进了门"却没有正确的本地映射/角色。**常见坑**:某些客户端库(如 supabase-js)把 DB 错误以返回值(`{ error }`)而非异常传出,不显式检查就会静默放行;务必检查后 fail-closed。

---

## 5. 角色投影 + 安全/非功能要求

- **两层角色**:`<app>_access`(准入,决定能否进)与**业务角色**(应用自定义,如 admin / reviewer / member,决定进来是什么)。准入由平台投影进 Keycloak Client Role;业务角色**只经 Webhook** 投给应用,由应用映射为本地权限。平台不管应用内的资源级控制。
- **fail-closed**:任何校验(验签、验 token、验角色)不通过一律拒绝;先验证后副作用。
- **有界残余窗**:平台无"按 user_id 即时吊销全部会话"的通用能力;`user.logout` / 撤权后,已签发未过期的 access token 在其 `exp` 内仍可能被重放。残余窗 = token 剩余寿命,由 webhook + 对账收敛。应用侧可通过缩短 token 寿命 / 主动校验状态进一步收窄。
- **对账**:平台每小时校验准入投影一致性;应用侧建议记录本地授权变更,便于对账与审计。

---

## 6. 接入自检清单(交付前逐条过)

- [ ] Keycloak Client 已建,Redirect URI / Web Origins 正确
- [ ] 登录门校验 token:签名 / `iss` / `aud`(或 `azp`) / `exp` / `resource_access` 准入角色;401 与 403 语义正确
- [ ] 前端(如为 SPA)已处理 `openid` scope、`provider_token`、hash 路由回调
- [ ] Webhook 端点:验签(HMAC + ±300s + 恒定时间比较)、按 event-id 幂等、2xx/非2xx 响应语义正确
- [ ] 事件矩阵已实现:停用/撤权 → 封禁;角色分配 → 本地角色投影;并**只处理本应用 + 幂等收敛**
- [ ] 本地用户映射以 `keycloak_sub` 为键(非 email);物化失败返回可重试错误
- [ ] webhook 密钥与平台 `webhookSecretRef` 指向的值一致
- [ ] 撤权后业务侧确实拒绝(已验证)

---

## 7. 参考实现

### A. 通用可复用参考(IC `business-app-kit`)—— 任何应用可直接使用/对照

| 你要实现的 | 参考 |
|---|---|
| token 准入校验 | `identity-portal/lib/business-app-kit/verify-access.ts`(`checkApplicationAccess`) |
| webhook 验签 | `identity-portal/lib/business-app-kit/verify-webhook.ts`(`verifyPlatformWebhook`)、`lib/sync/webhook-signature.ts` |

### B. 完整工作样例(首个接入应用 —— 仅作端到端对照,非契约的一部分)

> 样例为 TianGong LCA(基于 Supabase self-host)。技术栈不同的应用只需遵循 §1–§6 契约,不必照搬其实现。

| 环节 | 样例文件(TianGong LCA 仓) |
|---|---|
| 完整登录门 | `docker/volumes/functions/identity_login_sync/index.ts` |
| 完整 webhook 消费 + 事件矩阵 | `docker/volumes/functions/identity_center_webhook/index.ts`、`_shared/identity_center_core.ts`(`decideWebhookAction`) |
| SPA 前端(hash 路由 + provider_token)| `src/services/auth/api.ts`(`completeIdentityCenterLogin`)、`src/services/supabase/index.ts` |

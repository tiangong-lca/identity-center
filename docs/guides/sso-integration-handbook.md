---
docType: guide
scope: repo
status: active
authoritative: true
owner: identity-center
language: zh
whenToUse: 新业务应用接入统一身份平台时；接入前评估工作量时；接入中遇到问题时排查。
whenToUpdate: 接入流程变化时；新的最佳实践出现时；有新的接入案例时。
checkPaths:
  - docs/guides/sso-integration-handbook.md
  - docs/guides/business-app-integration-spec.md
  - docs/guides/business-app-onboarding.md
  - docs/guides/cms-sso-pitfalls.md
lastReviewedAt: 2026-07-09
---

# 业务应用 SSO 接入说明书

> 面向**要接入统一身份平台的业务应用开发者**。
> 本文档基于首个接入应用（CMS）的实战经验编写，侧重「怎么做」和「别踩坑」。
> 技术契约细节见 [业务应用接入技术规范](./business-app-integration-spec.md)。

---

## 0. 你需要实现什么

```
用户 → 你的应用（登录） → Keycloak（SSO） → 你的应用（建本地 session）
                                        ↓
                          identity-center（管理账号/准入/角色）
```

你的应用需要实现 **3 样东西**：

| # | 是什么 | 复杂度 | 必须？ |
|---|---|---|---|
| 1 | **OIDC 登录门**——接收 Keycloak 签发的 token，验证后建本地 session | ⭐⭐ | 是 |
| 2 | **Backchannel Logout 端点**——接收 Keycloak 的登出通知，清除本地 session | ⭐⭐⭐⭐⭐ | 是（如需 SLO） |
| 3 | **Webhook 接收端点**——接收 identity-center 事件（用户禁用/撤权） | ⭐⭐ | 推荐 |

---

## 1. 准备工作（在 identity-center 侧完成）

### 1.1 注册应用

联系 identity-center 管理员，提供以下信息：

| 信息 | 示例 | 用途 |
|---|---|---|
| 应用编码 | `cms` | 唯一标识 |
| 应用名称 | `内容管理系统` | 显示名称 |
| 登录入口 URL | `http://your-app/login` | 用户点击「进入应用」的地址 |
| OIDC 回调 URL | `http://your-app/auth/callback` | Keycloak 授权码回调地址 |
| 登出回调 URL | `http://your-app/login` | SLO 完成后跳转的地址 |
| Webhook URL | `http://your-app/webhook/identity-center` | 接收事件通知（可选） |

管理员会在 identity-center 后台创建应用，自动在 Keycloak 注册 Client。

### 1.2 获取配置信息

注册完成后，你将获得：

```
Keycloak Base URL:    http://your-keycloak:8080
Realm:                company-dev
Client ID:            your-app-business-app
Client Secret:        <secret>
Access Role:          your_app_access
```

---

## 2. 实现 OIDC 登录门

### 2.1 登录流程

```
用户访问你的应用
    ↓
检查本地 session 是否有效
    ↓ (无效)
302 重定向到 Keycloak 授权端点
    ↓
    GET /realms/company-dev/protocol/openid-connect/auth
        ?client_id=your-app-business-app
        &redirect_uri=http://your-app/auth/callback
        &response_type=code
        &scope=openid
        &code_challenge=<PKCE challenge>
        &code_challenge_method=S256
    ↓
用户在 Keycloak 登录（如已有 SSO session 则免登录）
    ↓
Keycloak 302 回调你的 callback URL，带 code
    ↓
你的后端用 code 换 token
    POST /realms/company-dev/protocol/openid-connect/token
        grant_type=authorization_code
        code=<code>
        client_id=your-app-business-app
        client_secret=<secret>
        code_verifier=<PKCE verifier>
    ↓
获得 access_token + id_token + refresh_token
    ↓
验证 access_token（见 2.2）
    ↓
验证通过 → 建本地 session → 用户进入应用
```

### 2.2 Token 验证（必须做）

**不是拿到 token 就完事了**。你必须在建本地 session 前验证：

| 检查项 | 怎么做 | 失败处理 |
|---|---|---|
| 签名 | 用 Keycloak JWKS（`/protocol/openid-connect/certs`）验 RS256 | 401 拒绝 |
| `iss` | 等于 `${KEYCLOAK_BASE_URL}/realms/company-dev` | 401 拒绝 |
| `aud` | 包含你的 `client_id` | 401 拒绝 |
| `exp` | 未过期 | 401 拒绝 |
| 准入角色 | `resource_access["your-app-business-app"].roles` 含 `your_app_access` | 403 拒绝 |

> **关键**：`sub`（Keycloak 用户唯一标识）是你与 identity-center 之间的**唯一身份键**。不要用 email——email 可变。

### 2.3 本地用户映射

你的应用需要一张映射表：

```sql
CREATE TABLE app_users (
    keycloak_sub  VARCHAR(64) PRIMARY KEY,  -- Keycloak sub，唯一身份键
    local_user_id <类型> NOT NULL,           -- 你的本地用户 ID
    created_at    TIMESTAMP DEFAULT NOW()
);
```

首次 OIDC 登录时，如果 `keycloak_sub` 在映射表中不存在，自动创建本地用户并记录映射。

---

## 3. 实现 Backchannel Logout（SLO 的核心）

> **这是整个接入中最复杂的部分。** 排期请按预估的 2-3 倍计算。

### 3.1 为什么需要 Backchannel Logout

用户在你的应用登出 → Keycloak session 结束 → Keycloak **服务器对服务器**通知所有相关应用清除本地 session。这叫 Back-Channel Logout。

没有它，用户在你这里登出了，但 identity-center portal 和其他应用的 session 还在——安全隐患。

### 3.2 你需要做什么

#### 步骤 A：实现 Backchannel Logout 端点

```
POST /your-app/backchannel-logout
Content-Type: application/x-www-form-urlencoded

logout_token=<JWT>
```

端点逻辑：

1. **解析 JWT**：从 `logout_token` 字段获取 JWT
2. **验证签名**：用 Keycloak JWKS 验证 RS256 签名
3. **验证内容**：
   - `iss` 等于 Keycloak issuer
   - `aud` 包含你的 client_id
   - `events` 字段值为 `http://schemas.openid.net/event/backchannel-logout`
   - 包含 `sub`（用户标识）或 `sid`（session 标识）
4. **清除本地 session**：根据 `sub` 查找并删除该用户的所有本地 session
5. **返回 200**：即使没有找到 session 也返回 200（幂等）

#### 步骤 B：注意事项

| 坑 | 说明 |
|---|---|
| **JWT typ 是 `logout+jwt`** | 很多 JWT 库的默认处理器不认这个类型。可能需要用底层 API 手动验签。 |
| **Keycloak 在 Docker 中** | Keycloak 配置 backchannel URL 时，不能用 `localhost`（指向容器自身），要用 `host.docker.internal`（macOS）或宿主机 IP（Linux）。 |
| **必须幂等** | Keycloak 会重试失败的 backchannel 请求。重复调用不能报错。 |
| **必须在免认证路径下** | 这个端点不能要求登录，因为它是服务器间的请求。 |

#### 步骤 C：在 Keycloak 注册 Backchannel URL

由 identity-center 管理员在 bootstrap 脚本中配置：

```typescript
attributes: {
  'backchannel.logout.url': 'http://your-app-host/backchannel-logout',
  'backchannel.logout.session.required': 'true',
}
```

### 3.3 SLO 完整流程

```
用户在你的应用点击「退出」
    ↓
你的应用清除本地 session
    ↓
302 到 Keycloak end_session_endpoint
    /realms/company-dev/protocol/openid-connect/logout
        ?client_id=your-app-business-app
        &id_token_hint=<登录时拿到的 id_token>
        &post_logout_redirect_uri=http://your-app/login
    ↓
Keycloak 结束 SSO session
    ↓
Keycloak 向所有相关客户端发 Backchannel Logout
    ├→ POST your-app/backchannel-logout  → 清除本地 session ✅
    ├→ POST identity-center/backchannel-logout → 清除 portal session ✅
    └→ POST other-apps/backchannel-logout → 清除各自 session ✅
    ↓
Keycloak 302 回到 post_logout_redirect_uri
    ↓
用户看到登录页（全局登出完成）
```

---

## 4. 实现 Webhook（推荐）

identity-center 在用户状态变更时主动通知你的应用：

| 事件 | 你应该做什么 |
|---|---|
| 用户禁用 | 立即清除该用户的所有本地 session |
| 准入撤销 | 清除 session + 标记用户无权访问 |
| 角色变更 | 更新本地角色映射（如有） |

Webhook 验签方式：

```
Header: X-Webhook-Signature: sha256=<base64(HMAC-SHA256(secret, timestamp + '.' + rawBody))>
Header: X-Webhook-Timestamp: <unix timestamp>
Header: X-Webhook-Event-Id: <uuid>
```

按 `X-Webhook-Event-Id` 幂等去重。失败重试 5 次（1s/5s/30s/2min/10min）。

---

## 5. 登出端点实现要点

你的登出端点（如 `/your-app/logout`）需要：

1. **清除本地 session**
2. **读取 id_token**（从 cookie 或 session 中）
3. **302 到 Keycloak end_session**：
   ```
   /realms/company-dev/protocol/openid-connect/logout
       ?client_id=your-app-business-app
       &id_token_hint=<id_token>
       &post_logout_redirect_uri=http://your-app/login
   ```
4. **`post_logout_redirect_uri` 必须与 Keycloak 客户端配置的 `post.logout.redirect.uris` 匹配**，否则 Keycloak 报 `invalid_redirect_uri`。

> **重要**：`post_logout_redirect_uri` 应该指向你的 OIDC 登录入口（让用户看到登录页），而不是旧的应用入口。

---

## 6. 测试清单

### 6.1 登录测试

- [ ] 从 identity-center portal 点击「进入应用」，自动 SSO 登录
- [ ] 直接访问应用登录入口，跳转 Keycloak 登录页
- [ ] Token 验证拒绝无效签名 / 过期 / 缺少准入角色的 token
- [ ] 首次登录自动创建本地用户映射

### 6.2 登出测试（SLO）

- [ ] 在你的应用登出 → 你的应用 session 清除
- [ ] 在你的应用登出 → identity-center portal session 同步清除
- [ ] 在你的应用登出 → 其他已登录应用 session 同步清除
- [ ] 登出后跳转到 OIDC 登录页（非旧登录入口）
- [ ] 在 identity-center portal 登出 → 你的应用 session 同步清除

### 6.3 账号管理测试

- [ ] 在 identity-center 禁用用户 → 该用户的本地 session 被清除
- [ ] 在 identity-center 撤销准入 → 该用户无法再登录
- [ ] 在 identity-center 重新启用 → 用户可以再次 SSO 登录

---

## 7. 常见问题排查

| 现象 | 可能原因 | 排查方法 |
|---|---|---|
| SSO 登录成功但进入应用报 NPE | Principal 类型不匹配 | 检查你的安全框架 principal 类型是否一致 |
| 登出后仍可免密进入 | 未实现 backchannel logout | 检查 Keycloak 客户端的 backchannel.logout.url 配置 |
| Backchannel 请求未到达 | Docker 网络隔离 | 检查 URL 是否用了 `host.docker.internal` |
| `invalid_redirect_uri` | post_logout_redirect_uri 不匹配 | 检查 Keycloak 客户端的 post.logout.redirect.uris |
| JWT 验证失败 | typ: logout+jwt 不被支持 | 用底层 API 验签，绕过默认 JWT processor |
| 应用列表 500 错误 | 数据库连接失败 | 检查 DATABASE_URL 端口是否与 Docker 映射一致 |
| Keycloak 账号不显示应用 | 账号未通过 identity-center 创建 | 删除后经 identity-center 管理 API 重建 |

---

## 8. 参考实现

| 参考 | 位置 |
|---|---|
| CMS OIDC 登录/登出/backchannel | `backend_tiangongCms/src/.../OidcCallbackAction.java` |
| CMS Shiro OIDC Realm | `backend_tiangongCms/src/.../KeycloakOidcRealm.java` |
| CMS Webhook 处理 | `backend_tiangongCms/src/.../WebhookAction.java` |
| identity-center Backchannel Logout | `identity-portal/app/api/auth/backchannel-logout/route.ts` |
| identity-center JWT 撤销检查 | `identity-portal/lib/auth/auth-config.ts` |
| Keycloak 客户端 bootstrap 脚本 | `identity-portal/scripts/bootstrap-keycloak-realm.ts` |
| E2E 测试脚本 | `identity-portal/tmp/cms-logout-redirect-e2e.mjs` |
| 踩坑记录（详细） | [CMS SSO 集成踩坑记录](./cms-sso-pitfalls.md) |

---

## 9. 工作量估算

| 工作项 | 预估 | 备注 |
|---|---|---|
| OIDC 登录门 | 2-4h | 取决于现有框架 |
| Token 验证 + 准入检查 | 1-2h | |
| 本地用户映射 | 1h | |
| Backchannel Logout 端点 | 4-8h | **最耗时**，建议翻倍预估 |
| Webhook 端点 | 2h | |
| 登出流程（end_session + id_token） | 2-3h | |
| Session 存储改造（如需分布式） | 2-4h | |
| E2E 测试 | 3-5h | SLO 全链路必须覆盖 |
| **合计** | **17-29h** | 建议排 3-4 个工作日 |

> 经验值：CMS 接入实际花了 20h+，其中 SLO 占了 10h。

# 09. 安全设计

## 1. 目标

本文定义统一用户门户、Keycloak、管理后台和多业务应用接入的安全控制。

## 2. 安全边界

```text
浏览器
  不可信

Next.js 服务端
  可信应用层

Keycloak
  身份源

管理后台本地权限模型
  管理后台权限事实源

业务系统
  业务授权执行层

数据库
  数据持久层
```

## 3. Secret 管理

禁止进入浏览器：

- Keycloak admin client secret。
- service account token。
- 数据库连接串。
- 业务应用 service key，例如 Supabase service role key。
- 内部 API key。

要求：

- 使用密钥管理服务或部署平台 secret。
- 按环境隔离 secret。
- 定期轮换。
- 最小权限。
- 不写入日志。

## 4. Token 安全

服务端校验：

```text
签名
iss
aud
exp
nbf
sub
azp/client_id
角色/权限
resource_access[当前应用 client_id].roles
```

禁止：

- 只在前端解析 token 后信任权限。
- 将 Admin token 返回给浏览器。
- 长期存储 refresh token 到 localStorage。

## 5. Cookie 安全

建议：

```text
HttpOnly
Secure
SameSite=Lax 或 Strict
短有效期
```

管理后台高风险操作要求近期认证。

## 6. CSRF

写操作必须防 CSRF。

目标态采用组合方案：SameSite Cookie + Origin 头校验 + JSON-only Content-Type。

### 6.1 Cookie 设置

所有认证 Cookie 必须配置：

```text
HttpOnly: true
Secure: true（生产环境）
SameSite: Lax
Path: /
```

`SameSite: Lax` 可以阻止跨站 GET 以外的请求自动携带 Cookie，覆盖绝大多数 CSRF 攻击场景。不使用 `Strict`，因为会破坏从外部链接进入门户的正常跳转。

### 6.2 API 防护

所有写操作 API（POST、PUT、PATCH、DELETE）必须：

- 只接受 `Content-Type: application/json`，拒绝 `application/x-www-form-urlencoded` 和 `multipart/form-data` 的跨站请求。
- 校验 `Origin` 头是否在允许列表中，无 `Origin` 头或不在允许列表中的请求拒绝。
- 跨站请求（如 Webhook 回调）不使用 Cookie 认证，改用签名验证。

### 6.3 Server Actions

Next.js Server Actions 内置 CSRF 防护，直接使用即可，不需要额外维护 CSRF Token。

### 6.4 Route Handlers

Route Handlers 按上述方案实现校验，封装统一的中间件或工具函数：

```text
lib/http/csrf-check.ts
```

校验逻辑：

1. 请求方法为 GET、HEAD、OPTIONS 时跳过。
2. 校验 Content-Type 是否为 application/json。
3. 校验 Origin 头是否在允许列表中。
4. 任一校验失败返回 403。

不维护额外的 CSRF Token。该方案对现代浏览器足够安全，且与 SPA + Server Actions 架构配合良好。

## 7. XSS

要求：

- 不信任用户输入。
- 输出 HTML 必须转义。
- 禁用不必要的 `dangerouslySetInnerHTML`。
- 管理后台富文本如有需要必须白名单清洗。
- 配置 CSP。

## 8. CORS

默认不开放跨域管理 API。

如必须开放：

- 明确 allowlist。
- 不使用 `*` 搭配凭证。
- 按环境配置。

## 9. SSRF

管理后台可能配置应用 URL、回调地址、Webhook。

防护：

- 禁止访问内网 IP。
- 禁止访问 metadata 地址。
- URL allowlist。
- DNS rebinding 防护。
- 服务端请求超时。

## 10. 用户枚举防护

注册、找回密码、验证邮件统一响应：

```text
如果账号存在，我们会发送后续邮件。
```

不暴露：

- 邮箱是否存在。
- 用户是否被禁用。
- 用户是否来自某身份源。

## 10.1 速率限制

所有公开接口和管理 API 必须实施分层速率限制。

### 10.1.1 限制规则

| 接口类型 | 限制维度 | 限制频率 | 说明 |
|---|---|---|---|
| 登录 | IP + 账号 | 5 次/分钟 | 超过后要求等待或验证码 |
| 注册 | IP | 10 次/小时 | 防批量注册 |
| 找回密码 | IP + 邮箱 | 3 次/小时 | 防枚举和滥用 |
| 管理后台 API | 用户 ID | 100 次/分钟 | 防滥用 |
| Webhook 回调 | 应用 ID | 60 次/分钟 | 防误配置导致的风暴 |

### 10.1.2 实现要求

- 使用 Redis 实现滑动窗口算法。
- 触发限流后返回 `429 Too Many Requests`。
- 不在响应中暴露具体剩余次数，防止枚举攻击。
- 限流计数维度按接口类型组合，不单一依赖 IP。

### 10.1.3 Redis Key 命名规范

```text
rate_limit:login:{ip}:{username_hash}
rate_limit:register:{ip}
rate_limit:password_reset:{ip}:{email_hash}
rate_limit:admin_api:{user_id}
rate_limit:webhook:{app_id}
```

使用 `username_hash` 和 `email_hash` 而不是明文，避免 Redis Key 泄露用户信息。

### 10.1.4 验证码

- 登录失败 N 次后要求输入验证码。
- 注册接口默认要求验证码。
- 推荐使用 Cloudflare Turnstile 或 hCaptcha。

## 11. 管理员越权防护

所有管理 API 必须：

- 校验登录状态。
- 校验 Keycloak 管理后台入口角色。
- 校验管理后台本地权限模型中的 permission code。
- 校验管理后台本地权限模型中的 scope。
- 写审计日志。

前端隐藏按钮不是权限控制。

## 12. 高风险操作

高风险操作：

```text
禁用用户
删除用户
重置密码
重置 MFA
授予管理员角色
修改 Client redirect URI
修改 service account 权限
```

要求：

- 二次确认。
- 记录 before/after。
- 操作人和 IP 入审计。
- 按风险策略要求近期认证、MFA 或审批。

撤权类操作必须满足关键执行点完成后才能声明完成：

- 用户禁用以 Keycloak disable 成功为完成标准。
- 应用准入撤销以 Keycloak Client Role 移除成功为关键完成点。
- 业务应用投影失败必须告警、重试和对账。
- API 和 UI 不能把“撤权请求已提交”显示成“撤权已完成”。

## 13. 审计日志

审计日志要求：

- Audit DB 是平台管理审计权威存储。
- append-only。
- 不提供普通 update/delete 业务接口。
- 不可由普通管理员删除。
- 记录 requestId、traceId 和 operationId。
- 记录 actor。
- 记录 target。
- 记录 before/after。
- 记录结果。
- 记录失败原因。
- 记录 record_hash 和 previous_hash，形成 hash chain 以增强篡改检测。
- 高风险管理审计至少保留 3 年，普通管理审计至少保留 1 年。

## 14. 网络安全

建议：

- Keycloak Admin API 限制内网访问。
- Next.js 管理后台启用 WAF/Ingress。
- 生产环境全站 HTTPS。
- 管理后台可限制 IP 或 VPN。
- 数据库不暴露公网。

## 15. 业务应用特别要求

- 业务应用内部权限、RLS、资源级访问控制由业务应用负责。
- 业务应用不能只信任前端传入的用户身份或角色。
- 业务应用 service key 只能服务端使用。
- 暴露给客户端访问的业务表必须启用对应的数据访问控制。
- 不使用用户可编辑 metadata 做关键授权。
- 业务应用接入层必须校验当前应用 Keycloak Client Role，缺少当前应用准入 Client Role 时返回 `403 APP_ACCESS_DENIED`。
- 平台准入查询 API 或业务应用本地准入缓存只作为加强拒绝和撤权兜底，不作为绕过 Keycloak Client Role 的放行依据。
- 业务应用必须消费平台撤权事件或通过对账回收本地准入投影。

## 15.1 Keycloak 不可用时的降级策略

Keycloak 是全局身份源，必须部署高可用集群。当 Keycloak 短暂不可用时，采用以下降级策略：

### 15.1.1 认证侧降级

- 已持有有效 token 的用户可以继续访问业务应用，直到 token 过期。
- 新登录请求返回 `503 Service Unavailable`，提示身份服务暂时不可用。
- 不启用任何绕过 Keycloak 的本地认证降级。

### 15.1.2 准入校验降级（仅拒绝模式）

业务应用可以维护本地准入缓存，在 Keycloak 不可用时使用，但必须遵循**仅拒绝**原则：

```text
本地准入缓存只用于加强拒绝，不用于放行。
```

具体规则：

- 本地缓存显示用户已被撤销准入 → 拒绝访问。
- 本地缓存显示用户已存在准入 → 仍必须依赖有效 token 中的 Client Role，不能仅凭缓存放行。
- 本地缓存过期或缺失 → 拒绝访问，不默认放行。
- 用户禁用事件已经通过事件同步到达业务应用 → 即使 token 仍有效也拒绝访问。

### 15.1.3 管理侧降级

- `break_glass_admin` 账号用于初始化或紧急修复本地 RBAC，不依赖 Keycloak 在线。
- Keycloak 不可用期间，管理后台只读功能可以基于本地数据继续提供。
- 管理写操作返回 `503`，防止在身份源不可用时执行不可逆操作。

### 15.1.4 恢复流程

- Keycloak 恢复后，触发全量对账，修复降级期间的任何状态差异。
- 降级期间的所有拒绝事件记录审计日志，便于事后排查。

## 16. 安全评审清单

上线前检查：

```text
Admin token 未暴露
管理 API 服务端鉴权
高危操作有审计
CSRF 防护有效
XSS 防护有效
CORS 最小化
Keycloak Admin API 网络隔离
数据库备份加密
secret 未入库/日志
用户枚举防护
速率限制生效
禁用用户会话处理
审计日志 append-only
管理后台本地权限模型服务端鉴权
应用准入撤销投影失败告警
Webhook 签名验证生效
Keycloak 不可用降级策略可用
```

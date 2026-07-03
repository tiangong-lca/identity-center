# GoTrue↔Keycloak 联邦:PKCE 行为查证记录(2026-07-03)

按 GOAL §5"关键集成实现前先查证"执行。对应 tiangong-lca 应用登记计划(`docs/implementation/plans/2026-07-03-tiangong-lca-app-registration.md`)Task 1 Step 1、集成设计 §5/§8 的待验证项。

## 待查证问题

GoTrue(Supabase self-host 的认证服务,tiangong-lca 以 self-host 形态接入)作为 confidential OAuth client 向上游 IdP(此处为 Keycloak `tiangong-lca-business-app` client,以 GoTrue 内建的 "Keycloak" external provider 联邦)发起 Authorization Code 授权时,是否发送 PKCE `code_challenge`/`code_challenge_method`?

若发送 → Keycloak client 上保留 `pkce.code.challenge.method: S256` 属性(强制校验)不会破坏联邦。
若不发送 → 该属性会导致 Keycloak 在授权码交换阶段拒绝 GoTrue(因请求缺少必需的 `code_challenge`),必须从 client 配置移除。

## 查证过程与结论

通过 Context7 查询 Supabase 官方文档站(`/websites/supabase`)与 GoTrue 源仓库(`/supabase/auth`,即原 GoTrue 项目,README 与 `_autodocs/api-reference/oauth-providers.md`):

1. **GoTrue 自身对外暴露的 `/authorize`、`/callback` 端点确实支持 PKCE**——但这是 GoTrue 作为"下游 IdP"时,*其自身的客户端*(浏览器 SDK / 移动端 App)与 GoTrue 之间的 PKCE,与本次要查证的"GoTrue 作为 client 联邦上游 Keycloak"是完全不同的一段流程,不可混淆:

   > `GET /callback`:query 参数含 `code`、`state`、`error`、`error_description`、`code_verifier`(PKCE 用)——这是 GoTrue 接收*自己下游客户端*回调时的参数,不是 GoTrue 发往 Keycloak 的请求。

2. **GoTrue 联邦外部 Provider(含 Keycloak)的配置项**(`oauth-providers.md`、README "External Authentication Providers"):

   ```bash
   GOTRUE_EXTERNAL_KEYCLOAK_ENABLED=true
   GOTRUE_EXTERNAL_KEYCLOAK_CLIENT_ID=your-client-id
   GOTRUE_EXTERNAL_KEYCLOAK_SECRET=your-client-secret
   GOTRUE_EXTERNAL_KEYCLOAK_REDIRECT_URI=https://auth.example.com/callback
   GOTRUE_EXTERNAL_KEYCLOAK_URL=https://keycloak.example.com/realms/myrealm
   ```

   仅有 `CLIENT_ID`/`SECRET`/`REDIRECT_URI`/`URL`,**无任何 `code_verifier`/`code_challenge` 相关配置项**——即标准 confidential client 的 client_secret 授权码流程,不是 PKCE 流程的形态。

3. **GoTrue 处理上游 Provider 回调、兑换 token 的数据流**(`oauth-providers.md` "OAuth Callback Data Processing Flow"):

   ```text
   1. Provider sends code to /callback
   2. Auth exchanges code for access_token
      (using client_id and client_secret)
   3. Auth calls provider's userinfo_endpoint ...
   ```

   明确写明第 2 步授权码兑换 access_token **仅使用 `client_id` 和 `client_secret`**,未提及 `code_verifier`。这与"GoTrue 自身 `/callback` 端点接受下游 `code_verifier`"的表述(问题 1)形成对照,进一步印证:GoTrue↔上游 Provider 这一段联邦流程走的是纯 confidential client + client_secret,不携带 PKCE 参数。

**结论:GoTrue 作为 client 对上游 Keycloak provider 发起 Authorization Code 请求时不发送 `code_challenge`**,与集成设计 §5 的已知结论一致。Keycloak `tiangong-lca-business-app` client 不应设置 `pkce.code.challenge.method: S256`(会导致该属性强制校验时拒绝 GoTrue 的授权码交换),改以 `client_secret` 保障机密性——即 `attributes: {}`(移除 PKCE 属性)。

## 查证局限与后续动作

Context7 索引的是 GoTrue 公开文档/README 与自动生成的 API 参考,**未直接检索到 GoTrue Go 源码中 `internal/api/provider/` 下 Keycloak/OIDC provider 实现里 `oauth2.Config.AuthCodeURL(...)` 调用点的逐行代码**(即未能 100% 从实现源码级别断言"绝对不传 code_challenge",只能从文档/配置面强证据推断)。按集成设计 §8 风险登记("PKCE 属性与 GoTrue 上游兼容性——阶段一实测,不兼容则移除该 client 属性"),**本结论在阶段一真实联调(lca-platform 侧接入 GoTrue 并实际打通登录)时需重新用抓包/日志核实**:若发现 Keycloak 拒绝了 GoTrue 的授权码交换请求(如返回 `invalid_request: Missing parameter: code_challenge_method`),说明本结论有误,需回退保留该属性;若登录链路打通,则本结论确认成立。

## 参考链接

- <https://github.com/supabase/auth/blob/master/README.md>(External Authentication Providers 配置项)
- <https://github.com/supabase/auth/blob/master/_autodocs/api-reference/oauth-providers.md>(OAuth Provider Callback、OAuth Callback Data Processing Flow、Keycloak (Self-Hosted) OAuth Provider Configuration)
- <https://supabase.com/docs/guides/auth/social-login/auth-keycloak>(Sign in with Keycloak,下游客户端接入示例,佐证 GoTrue 对外暴露 PKCE 是另一段流程)
- 集成设计:`_docs/plans/2026-07-03-lca-platform-identity-center-integration-design.md` §5、§8(风险登记:"PKCE 属性与 GoTrue 上游兼容性")

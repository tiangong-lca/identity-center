# 业务应用接入指南

> 面向接入统一身份平台的业务应用团队。首个接入应用为 TianGong LCA(`tiangong-lca`,基于 Supabase self-host),本指南由其接入过程沉淀,可复用于后续应用。
> 权威依据:[迁移与接入指南](../design/03-governance/03-migration-onboarding-guide/README.md)、[总体架构设计 §12](../design/01-architecture/01-overall-architecture/README.md)。
>
> 注:自 D7 起,平台注册申请页支持用户直接勾选申请的应用与角色(多应用、每应用至多一角色,角色可不选),审批通过后自动授予对应准入与角色。此为平台侧体验增强,不改变本指南定义的业务应用接入契约。

## 接入十步

1. **Keycloak 建 Client**:`<app>-business-app`(confidential,Standard Flow,PKCE S256),配置 Redirect URI / Web Origins 为应用实际域名。
2. **建准入 Client Role**:`<app>_access`(平台准入投影目标)。
3. **应用接入 OIDC**:用 Auth.js Keycloak Provider 或标准 OIDC 库,issuer = `${KEYCLOAK_BASE_URL}/realms/company-dev`。
4. **后端校验 token**:验证签名、`iss`、`aud`、`exp`,并校验 `resource_access["<app>-business-app"].roles` 含 `<app>_access`。参考实现:`identity-portal/lib/business-app-kit/verify-access.ts`(`checkApplicationAccess`)。
   - 无有效 token → **401 UNAUTHENTICATED**;缺准入角色 → **403 APP_ACCESS_DENIED**。
5. **建本地用户映射**:`app_users(keycloak_sub, local_user_id, ...)`,以 `keycloak_sub` 为跨系统身份键(**不用 email**)。
6. **平台登记应用**:在 `applications` 写入 code / keycloakClientId / accessClientRole / webhookUrl / webhookSecretRef(见 `scripts/seed/business-apps.ts`)。
7. **平台授予准入**:管理后台或 API 授予 → 平台投影到 Keycloak Client Role。
8. **消费 Webhook**:接收平台事件(用户禁用、准入撤销等)。验签见 `lib/business-app-kit/verify-webhook.ts`:
   - 头 `X-Webhook-Signature: sha256=base64(HMAC-SHA256(secret, timestamp + '.' + rawBody))`、`X-Webhook-Timestamp`(±300s)、`X-Webhook-Event-Id`。
   - **按 `X-Webhook-Event-Id` 幂等去重**;平台失败重试 1s/5s/30s/2min/10min 共 5 次,5 连败进死信告警。
9. **本地业务权限自治**:应用继续维护角色对应的具体权限、资源级控制、业务审计。平台只管"是否可进入 + 在应用中是什么角色"。
10. **接入审计与对账**:应用侧记录本地授权变更;平台侧对账任务每小时校验准入投影一致性。

## 存量用户迁移

工具:`scripts/migrate-legacy-users.ts`。匹配优先级 `externalId > 已验证邮箱 > 手机号 > username > 人工`。命中即建 `portal_users` 映射(存量身份记入 metadata),未命中标记 manual 待人工。迁移不自动创建 Keycloak 用户。

旧登录并行与下线状态机(按需):`dual_login → keycloak_default → legacy_disabled → legacy_removed`,每态定义进入/退出/回滚条件。

## 接入验收清单(10 项)

- [ ] Keycloak Client 已创建,Redirect URI / Web Origins 正确
- [ ] 应用后端校验 token(签名/iss/aud/exp/`resource_access` 角色)
- [ ] 本地用户映射建立,`keycloak_sub` 唯一
- [ ] 旧登录回滚方案已验证(如适用)
- [ ] 用户禁用事件同步可用(收到并处理)
- [ ] 审计日志可查询
- [ ] 权限边界确认(平台准入 vs 业务权限)
- [ ] 应用准入投影 Keycloak Client Role 已验证(授予后可进入)
- [ ] 业务应用撤权投影已验证(撤销后被拒绝)
- [ ] Webhook 验签 + 幂等 + 重试测试通过

## 交付物清单(每应用)

Keycloak Client 配置导出、登录流程说明、本地映射表说明、权限边界说明、回滚方案、测试报告(功能+安全)、上线计划。

## 端到端验证

平台侧联调测试见 `tests/integration/e2e-onboarding.test.ts`:注册→审批→准入→投影→同步(outbox→MQ→webhook 验签)→撤权→业务侧拒绝→对账无差异,以 `business-app-kit` 参考 verifier 代替真实应用全链路验证。

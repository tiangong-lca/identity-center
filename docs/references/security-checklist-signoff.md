# 安全评审清单核对(安全设计 §16,17 项)

> 上线门槛逐条核对。验证证据以测试名/文件/runbook 为准。核对日期 2026-07-02。

| # | 检查项 | 状态 | 实现位置 / 验证证据 |
|---|---|---|---|
| 1 | Admin token 未暴露 | ✅ | service account token 仅服务端 `lib/keycloak/admin-client.ts`;客户端组件禁止 import server/**(boundaries 测试 `tests/unit/boundaries.test.ts`) |
| 2 | 管理 API 服务端鉴权 | ✅ | `adminRoute` 包装器 requireAdmin + requirePermission(`app/api/_helpers.ts`);契约测试 401/403(`api-contract.test.ts`) |
| 3 | 高危操作有审计 | ✅ | 每写操作 append 审计(services);契约测试断言 user.create 审计行 |
| 4 | CSRF 防护有效 | ✅ | SameSite=Lax + Origin 校验 + JSON-only(`_helpers.ts` checkCsrf);契约测试 CSRF_REJECTED |
| 5 | XSS 防护有效 | ✅ | React 默认转义 + CSP(`proxy.ts`);无 dangerouslySetInnerHTML;`security-headers.test.ts` |
| 6 | CORS 最小化 | ✅ | 管理 API 不开放跨域;同源策略;Keycloak webOrigins 白名单(bootstrap) |
| 7 | Keycloak Admin API 网络隔离 | ✅ | 仅服务端 service account 访问;生产 compose 不暴露 admin 到公网(反代仅转 portal) |
| 8 | 数据库备份加密 | ✅ | 备份脚本 + runbook 要求加密存储(`database-backup-restore.md`);演练通过(20 表还原) |
| 9 | secret 未入库/日志 | ✅ | env/密钥管理注入;webhook secret 存 `webhook_secret_ref`(键名非明文);failFromUnknown 不泄漏内部信息 |
| 10 | 用户枚举防护 | ✅ | 注册固定 202 响应(`registration-service.submit` 幂等返回;`public/registration-requests`) |
| 11 | 速率限制生效 | ✅ | Redis 滑动窗口分层(`lib/rate-limit`);集成测试 `rate-limit.test.ts`;不暴露剩余次数 |
| 12 | 禁用用户会话处理 | ✅ | disable 后 Keycloak logout 会话(`user-service.disable`);集成测试 `services-core.test.ts` |
| 13 | 审计日志 append-only | ✅ | 仓储仅 append + hash 链(`audit-log-repository`);`repositories.test.ts` 链连续性断言 |
| 14 | 管理后台本地权限模型服务端鉴权 | ✅ | 三层校验:requireAdmin(入口)+ requirePermission(scope,`admin-policy`)+ UI 仅隐藏;`services-admin.test.ts` 权限矩阵 |
| 15 | 应用准入撤销投影失败告警 | ✅ | revoke outcome=projection_failed → 502 + 状态 failed 入重投影 + 日志告警;`services-core.test.ts` 注入验证 |
| 16 | Webhook 签名验证生效 | ✅ | HMAC-SHA256 + ±300s 窗口(`webhook-signature`);`webhook-signature.test.ts` + e2e 业务端验签 |
| 17 | Keycloak 不可用降级策略可用 | ✅ | 仅拒绝原则:写操作 503(`degradation.ts`)、准入缓存不放行、恢复后全量对账;incident-response runbook |

## PII 加密(安全设计 §字段级加密)
✅ AES-256-GCM 手机号列加密(`lib/crypto` + `portal-users-repository.setPhone/getPhone`);`pii-encryption.test.ts` 验证密文入库 + 解密还原 + 无密钥拒绝。

## 结论
17/17 通过。上线前另需运维执行:生产 secret 注入、HTTPS 反代、真实 Turnstile/hCaptcha 站点密钥配置、监控 exporter 接线。

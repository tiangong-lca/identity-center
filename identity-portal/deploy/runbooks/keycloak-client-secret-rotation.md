# Runbook:Keycloak Client Secret 轮换

## 对象
- `user-portal`(登录)→ env `KEYCLOAK_CLIENT_SECRET`
- `user-portal-admin-api`(管理编排 service account)→ env `KEYCLOAK_ADMIN_API_CLIENT_SECRET`

## 步骤(建议每 90 天)
1. Keycloak Admin Console → Clients → 选中 client → Credentials → Regenerate Secret(或 `kcadm.sh`)。
2. 取新值:`pnpm tsx scripts/print-client-secret.ts <clientId>`。
3. 更新 `.env.production` 对应变量。
4. 滚动重启 portal + worker 使新 secret 生效。
5. 验证登录(user-portal)与管理 API(admin-api,如禁用用户)正常。

## 注意
- admin-api secret 轮换期间管理写操作短暂不可用(重启窗口);建议低峰执行。
- secret 只存密钥管理/环境变量,严禁入库或日志(安全清单项)。

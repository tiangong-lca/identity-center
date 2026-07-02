# 05. Keycloak 配置设计

## 1. 目标

本文定义 Keycloak realm、client、角色、组、MFA、邮件和环境隔离配置。

## 2. Realm 设计

推荐创建业务 realm：

```text
company
```

不要使用 `master` realm 承载业务用户。

环境隔离：

```text
company-dev
company-staging
company-prod
```

或者每个环境独立 Keycloak 实例。

## 3. Client 设计

每个应用独立 Client。

```text
user-portal
user-portal-admin-api
crm-web
billing-web
data-platform
supabase-business-app
mobile-app
```

## 4. 用户门户 Client

```text
Client ID: user-portal
Type: OpenID Connect
Client authentication: On
Access type: confidential
Standard flow: Enabled
Valid redirect URI: https://portal.example.com/api/auth/callback/keycloak
Web origin: https://portal.example.com
```

说明：

- 用于普通用户和管理员登录 Next.js 门户。
- 不用于调用 Admin API。

## 5. 管理 API Client

```text
Client ID: user-portal-admin-api
Type: OpenID Connect
Client authentication: On
Service accounts roles: Enabled
Flow: client credentials
```

用途：

- Next.js 服务端调用 Keycloak Admin REST API。
- 只能部署在服务端。
- 不能暴露到浏览器。

权限原则：

- 最小权限。
- 只授予用户管理、组管理、角色映射等必要权限。
- 生产环境定期轮换 secret。

## 6. Keycloak 全局角色

Keycloak 全局角色只保留管理后台入口、最高管理员种子身份和紧急恢复身份：

```text
admin_console_access
platform_admin
break_glass_admin
```

用途：

- `admin_console_access`：允许进入管理后台入口，不表达具体管理权限。
- `platform_admin`：平台最高管理员种子身份，可映射到管理后台本地权限模型中的内置 `platform_admin`。
- `break_glass_admin`：紧急恢复身份，只用于初始化、恢复或修复本地权限模型。

日常管理角色，例如 `user_admin`、`app_admin`、`auditor`、`support`，属于管理后台本地权限模型，不放在 Keycloak 全局角色中。

## 7. Client Roles

每个业务应用必须配置粗粒度 client role，用作认证侧应用准入投影。

示例：

```text
crm-web:
  crm_access

billing-web:
  billing_access

supabase-business-app:
  supabase_app_access
```

这些角色只用于应用准入，不用于细粒度业务权限。

平台应用准入事实源是统一身份平台数据库中的 `application_assignments`。Keycloak Client Role 是投影，不是准入事实源。

## 8. Groups

推荐分组：

```text
/departments/engineering
/departments/finance
/departments/hr
/authorization-inputs/crm-candidates
/authorization-inputs/billing-candidates
/admins/platform
/admins/user-admins
```

组适合表达组织结构、部门、人群、批量授权输入和管理员分组。

Group 可以作为批量授权输入，但不作为最终应用准入事实源，也不是业务应用放行信号。

批量授权必须展开写入统一身份平台数据库中的 `application_assignments`，再投影到业务应用对应的 Client Role。

正式配置和文档中避免使用“应用准入组”表达准入事实。需要描述 Group 参与授权流程时，使用“批量授权人群”“授权输入用户组”或“应用授权人群”。

## 9. Client Scopes

默认使用标准 OIDC scope：

```text
openid
email
profile
```

如需传递 `keycloak_sub`，使用标准 `sub` claim 即可。

不要把大量业务权限通过 token claim 下发。

## 10. 密码策略

建议：

- 最小长度。
- 大小写/数字/特殊字符策略。
- 密码历史。
- 密码过期策略按安全等级配置。
- 防暴力破解。

具体强度应结合组织安全要求。

## 11. MFA 策略

建议：

- 管理员强制 MFA。
- 普通用户按风险或组织策略启用。
- 高风险操作要求近期登录或 MFA。
- 支持 TOTP/WebAuthn 时优先考虑抗钓鱼能力。

## 12. 邮件配置

必须配置：

- SMTP Host。
- From Address。
- 邮件模板。
- 验证邮件。
- 重置密码邮件。
- 操作执行邮件。

生产要求：

- 使用可信邮件服务。
- 配置 SPF/DKIM/DMARC。
- 邮件模板避免暴露用户是否存在。

## 13. 主题配置

可以自定义：

- 登录页。
- 注册页。
- 找回密码页。
- MFA 页面。
- Account Console。

目标态可以使用 Keycloak 原生页面，也可以定制主题。正式设计不要求 Next.js 接管密码、MFA、找回密码等认证核心页面。

## 14. Token 配置

建议：

- Access token 有效期较短。
- Refresh token 按应用安全等级配置。
- 管理后台 session 更短。
- 启用 HTTPS。
- 生产环境使用稳定签名密钥管理策略。

## 15. 审计与事件

开启：

- Login Events。
- Admin Events。
- 用户创建、禁用、删除事件。
- 角色、组、client 变更事件。

事件用于：

- 审计。
- 同步。
- 对账。
- 安全告警。

## 16. 配置交付清单

每个环境应交付：

```text
Realm 名称
Client 列表
Redirect URI 列表
Web Origin 列表
Service Account 权限
Keycloak 全局角色
Groups
MFA 策略
密码策略
SMTP 配置
Admin Events 配置
备份策略
```

# 11. 迁移与接入指南

## 1. 目标

本文定义已有业务系统如何迁移到统一 Keycloak 身份体系，以及新业务系统如何接入。

## 2. 接入原则

```text
先统一认证
再统一身份映射
最后逐步治理权限
```

不要一次性重构所有业务权限。先统一身份和应用准入，再把“用户在应用中的角色分配”迁移到平台，最后由业务系统继续维护角色对应的具体权限。

## 3. 新应用接入流程

1. 在 Keycloak 创建 Client。
2. 配置 Redirect URI 和 Web Origin。
3. 应用接入 OIDC。
4. 后端校验 token。
5. 建立本地 `app_users` 映射。
6. 使用 `keycloak_sub` 作为外部身份键。
7. 在平台创建 `applications` 记录。
8. 将平台准入投影到 Keycloak Client Role。
9. 本地权限继续由应用维护。
10. 接入审计、Webhook/Connector 和对账。

## 4. 旧系统迁移流程

### 4.1 用户盘点

收集：

```text
旧系统用户 ID
用户名
邮箱
手机号
状态
角色
最后登录时间
所属组织
```

### 4.2 用户匹配

优先级：

```text
人工确认的外部 ID
已验证邮箱
手机号
用户名
人工处理
```

email 只用于辅助匹配，不作为最终主键。

### 4.3 建立映射

旧系统增加字段：

```text
keycloak_sub
```

或新增映射表：

```sql
legacy_user_identity_mapping
- legacy_user_id
- keycloak_sub
- match_method
- verified
- created_at
```

## 5. 首次登录绑定

如果不能提前完成全量绑定，可以使用首次登录绑定。

流程：

```text
用户用 Keycloak 登录
系统读取 keycloak_sub 和 email
查找旧用户
如唯一匹配，建立绑定
如多条匹配，进入人工确认
如无匹配，创建新本地用户
```

高风险系统需要人工审核。

## 6. 旧登录替换策略

旧登录替换使用迁移状态机描述：

```text
dual_login：旧登录 + Keycloak 登录并存
keycloak_default：默认 Keycloak 登录，旧登录作为回退
legacy_disabled：关闭旧登录入口
legacy_removed：清理旧密码和旧认证逻辑
```

每个迁移状态必须有进入条件、退出条件和回滚策略。

## 7. 角色权限迁移

不要直接把旧系统全部角色搬到 Keycloak。

建议：

- 应用准入事实迁移到平台 `application_assignments`。
- 应用准入认证投影迁移到 Keycloak Client Role。
- Keycloak Group 只用于组织、部门、批量管理和管理员分组。
- 用户在应用中的角色分配迁移到平台，例如系统管理员、数据审核员、数据编辑人员。
- 角色对应的具体权限定义保留在业务系统，例如能否编辑、审核、管理团队。
- 资源级权限不迁入 Keycloak。
- 平台权限中心沉淀应用准入、应用角色分配和跨应用共享授权事实。

## 8. 业务应用本地身份体系接入

Supabase 只是多个业务应用之一。统一身份平台不规定 Supabase 或其他业务应用内部表结构。

业务应用需要完成：

1. 在 Keycloak 创建对应 Client。
2. 在平台创建应用目录记录。
3. 建立本地用户与 `keycloak_sub` 的映射。
4. 消费平台应用准入授权和撤销事件。
5. 消费平台应用角色分配和撤销事件。
6. 按应用自身设计维护角色权限定义、组织、资源权限和数据访问控制。
7. 验证禁用用户、应用准入撤销和角色分配变更流程。

## 9. 多数据库系统接入

不同数据库只要求统一概念字段：

```text
keycloak_sub
local_user_id
status
metadata
created_at
updated_at
```

PostgreSQL、达梦、Oracle、MySQL 等可以使用不同物理类型。

## 10. 验证清单

应用接入前检查：

```text
Keycloak Client 已创建
Redirect URI 正确
后端校验 token
本地用户映射完成
keycloak_sub 唯一
旧登录回滚方案存在
用户禁用同步可用
审计日志可查询
权限边界已确认
Keycloak Client Role 准入投影已验证
业务应用撤权投影已验证
```

## 11. 回滚方案

必须保留：

- 旧登录短期回退。
- Keycloak Client 配置备份。
- 用户映射表备份。
- 权限变更审计。
- 迁移批次记录。

## 12. 迁移风险

| 风险 | 对策 |
|---|---|
| email 冲突 | 人工确认，不自动合并 |
| 用户无法登录 | 保留旧登录回退 |
| 权限丢失 | 迁移前导出旧权限 |
| 绑定错误 | 映射表可回滚 |
| 批量导入失败 | 分批导入和重试 |
| 用户禁用不同步 | 事件同步 + 对账 |

## 13. 接入交付物

每个应用接入应提交：

```text
Keycloak Client 配置
应用登录流程说明
本地用户映射表说明
权限边界说明
回滚方案
测试报告
上线计划
```

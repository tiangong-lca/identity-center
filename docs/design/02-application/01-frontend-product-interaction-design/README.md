---
docType: design-doc
scope: repo
status: active
authoritative: true
owner: identity-center
language: zh
whenToUse: 需要了解门户和管理后台的前端产品交互设计、页面结构或交互规范时阅读本文档。
whenToUpdate: 前端产品交互设计、页面结构或交互规范发生变化时更新本文档。
checkPaths:
  - docs/design/02-application/01-frontend-product-interaction-design/README.md
  - identity-portal/AGENTS.md
lastReviewedAt: 2026-07-06
lastReviewedCommit: 16f3661
---

# 06. 前端产品与交互设计

## 1. 目标

本文定义统一用户门户和管理后台的前端信息架构、页面、组件、交互流程和可用性要求。

设计原则：

- 管理后台以效率和清晰度优先。
- 避免营销页风格。
- 信息密度适中，方便搜索、筛选、批量处理。
- 危险操作必须明确、可审计、可撤销或可确认。
- 前端权限显示不能替代后端权限校验。

## 2. 用户角色

| 角色 | 主要任务 |
|---|---|
| 平台管理员 | 全局配置、应用接入、管理员授权 |
| 用户管理员 | 创建、禁用、启用、重置用户 |
| 应用管理员 | 管理某个应用的准入 |
| 审计员 | 查看日志和变更记录 |
| 支持人员 | 查询用户、辅助处理账号问题 |
| 普通用户 | 查看资料、安全设置、登录应用 |

## 3. 信息架构

一级导航：

```text
概览
用户管理
组织/租户
应用管理
角色权限
审计日志
系统设置
```

普通用户账号中心：

```text
我的资料
安全设置
登录会话
已授权应用
```

## 4. 页面清单

### 4.1 公共页面

| 页面 | 路径 | 说明 |
|---|---|---|
| 登录入口 | `/login` | 跳转 Keycloak 登录 |
| 注册入口 | `/register` | 跳转 Keycloak 注册或自定义注册 |
| 无权限页 | `/403` | 显示无权限原因和返回入口 |
| 错误页 | `/error` | 统一错误展示 |

### 4.2 账号中心

| 页面 | 路径 | 说明 |
|---|---|---|
| 我的资料 | `/account` | 基本信息 |
| 安全设置 | `/account/security` | MFA、密码修改入口 |
| 登录会话 | `/account/sessions` | 当前登录设备 |
| 已授权应用 | `/account/apps` | 可访问应用列表 |

### 4.3 管理后台

| 页面 | 路径 | 说明 |
|---|---|---|
| 概览 | `/admin` | 关键指标和告警 |
| 用户列表 | `/admin/users` | 搜索、筛选、批量操作 |
| 注册审批 | `/admin/registration-requests` | 审核用户注册申请 |
| 用户详情 | `/admin/users/[id]` | 用户资料、角色、应用、日志 |
| 创建用户 | `/admin/users/new` | 创建 Keycloak 用户 |
| 组织列表 | `/admin/orgs` | 组织/租户管理 |
| 应用列表 | `/admin/apps` | 接入应用管理 |
| 应用详情 | `/admin/apps/[id]` | Client、授权、回调地址 |
| 角色权限 | `/admin/roles` | 管理后台角色和权限 |
| 审计日志 | `/admin/audit` | 操作审计查询 |
| 系统设置 | `/admin/settings` | 安全策略、同步设置 |

## 5. 用户列表设计

字段：

```text
姓名
邮箱
状态
MFA
组织
应用数
最后登录时间
创建时间
来源
操作
```

筛选：

```text
状态
组织
应用
角色
是否启用 MFA
创建时间
最后登录时间
来源
```

批量操作：

```text
启用
禁用
加入组织
分配应用
发送验证邮件
导出
```

## 6. 用户详情设计

详情页使用 Tabs：

```text
概览
安全
组织
应用授权
角色/组
会话
审计日志
```

右侧固定危险操作区：

```text
禁用用户
重置密码
重置 MFA
强制登出
删除用户
```

删除用户默认不开放，需高级权限和二次确认。

## 7. 注册审批设计

注册审批页面用于处理用户自助注册申请。默认流程需要管理员审批；免审批模式下，该页面仍可用于查看自动通过记录。

列表字段：

```text
申请人姓名
邮箱
申请组织
申请理由
状态
提交时间
审批人
审批时间
```

主要操作：

```text
通过
拒绝
查看详情
批量通过
批量拒绝
```

通过注册申请后，页面应引导管理员继续分配应用准入和应用角色。审批通过不应在 UI 上表达为“已获得应用权限”。

## 8. 应用管理设计

应用详情包含：

```text
基础信息
Keycloak Client 信息
Redirect URI
Web Origins
应用准入用户
应用角色目录
用户应用角色分配
批量授权人群
同步状态
审计日志
```

强调：

```text
应用准入：用户能不能进入应用
应用角色分配：用户在应用里是什么角色
业务权限定义：该角色具体能做什么，由业务应用定义
```

## 9. 状态设计

用户状态：

```text
active
disabled
pending
locked
unverified
invited
```

注册申请状态：

```text
pending
approved
rejected
cancelled
```

应用状态：

```text
draft
active
disabled
archived
```

同步状态：

```text
synced
pending
failed
partial
```

状态展示必须同时使用颜色和文字，不仅依赖颜色。

## 10. 组件规范

通用组件：

```text
AppShell
Sidebar
Topbar
DataTable
FilterBar
SearchInput
StatusBadge
UserPicker
AppPicker
RolePicker
PermissionMatrix
AuditTimeline
ConfirmDialog
DangerDialog
EmptyState
ErrorState
LoadingSkeleton
```

表格要求：

- 支持分页。
- 支持排序。
- 支持搜索。
- 支持筛选。
- 支持列显示设置。
- 支持保存筛选视图。
- 批量操作必须显示选中数量。

## 11. 危险操作交互

高风险操作：

```text
禁用用户
删除用户
授予管理员角色
重置 MFA
修改应用回调地址
修改 Keycloak Client 配置
```

交互要求：

- 弹窗说明影响范围。
- 要求输入用户邮箱或应用 code 确认。
- 显示操作者身份。
- 写审计日志。
- 操作完成后显示结果。

## 12. 权限可见性

菜单权限：

- 无权访问一级模块时隐藏菜单。
- 只读权限显示页面但隐藏写操作。
- 危险操作无权限时隐藏，必要时置灰并说明原因。

接口权限：

- 后端必须再次校验。
- 前端仅用于体验优化。

## 13. 文案规范

避免用户枚举：

```text
如果账号存在，我们会发送后续邮件。
```

权限不足：

```text
你没有执行该操作的权限。
```

状态变化：

```text
用户状态已变化，请刷新后重试。
```

外部系统失败：

```text
Keycloak 操作失败，请稍后重试或联系管理员。
```

## 14. 响应式设计

优先桌面。

要求：

- 1440px 及以上完整体验。
- 1024px 可用。
- 手机端仅支持账号中心和轻量查看。
- 管理批量操作不要求手机端完整支持。

## 15. 可访问性

要求：

- 表单字段有 label。
- 所有图标按钮有 tooltip 或 aria-label。
- 键盘可操作。
- 焦点状态明显。
- 错误提示与字段关联。
- 颜色不是唯一状态表达。

## 16. API 反推

前端至少需要这些 API 能力：

```text
用户分页查询
用户详情
注册申请查询
注册申请审批
用户状态变更
用户应用授权
用户组/角色管理
应用分页查询
审计日志查询
筛选项元数据
```

API 设计应基于本前端页面清单继续细化。

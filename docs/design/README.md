---
docType: design-index
scope: repo
status: active
authoritative: true
owner: identity-center
language: zh
whenToUse: 需要定位目标态设计文档集(架构/应用/治理三类正式设计文档)的索引和评审状态时阅读本文档。
whenToUpdate: 设计文档集目录结构、评审状态或收录范围发生变化时更新本文档。
checkPaths:
  - docs/design/README.md
  - docs/README.md
lastReviewedAt: 2026-07-07
lastReviewedCommit: cbf5737
---

# 统一身份与用户门户设计文档集

本文档集用于评审和落地以下方案：

```text
Keycloak 作为统一身份中心
Next.js 作为统一用户门户和管理后台
多业务系统作为独立 Keycloak Client 接入
Supabase 作为其中一个业务应用
各应用保留应用域业务权限
```

本文档集描述目标态完整设计。实施顺序、里程碑、范围裁剪和临时过渡方案不放在本设计文档集中，应在实施方案中单独定义。

## 目录结构

```text
design/
├─ README.md
├─ 01-architecture/   架构设计：总体架构、门户架构、认证、用户模型、Keycloak 配置
├─ 02-application/    应用设计：前端、API、同步、项目结构
└─ 03-governance/     治理设计：安全、部署运维设计、迁移接入设计
```

## 文档目录

### 架构设计

| 编号 | 文档 | 说明 |
|---:|---|---|
| 01 | [总体架构设计](./01-architecture/01-overall-architecture/) | 多业务系统、异构数据库、Supabase 集成总体方案 |
| 02 | [用户门户与管理后台技术设计](./01-architecture/02-user-portal-admin-architecture/) | Keycloak + Next.js 门户和管理后台架构 |
| 03 | [身份认证与会话设计](./01-architecture/03-auth-session-design/) | OIDC、登录、注册、登出、MFA、Token、Session |
| 04 | [用户与权限模型设计](./01-architecture/04-user-permission-model/) | keycloak_sub、本地用户映射、应用准入、业务权限 |
| 05 | [Keycloak 配置设计](./01-architecture/05-keycloak-configuration-design/) | Realm、Client、Roles、Groups、MFA、邮件、事件 |

### 应用设计

| 编号 | 文档 | 说明 |
|---:|---|---|
| 01 | [前端产品与交互设计](./02-application/01-frontend-product-interaction-design/) | 信息架构、页面、组件、交互、表格、危险操作 |
| 02 | [API 设计](./02-application/02-api-design/) | 管理后台 API、用户/组织/应用/角色/审计接口 |
| 03 | [同步与事件设计](./02-application/03-sync-event-design/) | Keycloak 事件、应用准入同步、重试、死信、对账 |
| 04 | [项目结构设计](./02-application/04-project-structure-design/) | Next.js 项目目录、分层、依赖边界、测试结构 |

### 治理设计

| 编号 | 文档 | 说明 |
|---:|---|---|
| 01 | [安全设计](./03-governance/01-security-design/) | Secret、Token、CSRF、XSS、SSRF、审计、越权防护 |
| 02 | [部署与运维设计](./03-governance/02-deployment-operations-design/) | 部署拓扑、监控、日志、备份、发布、密钥轮换 |
| 03 | [迁移与接入指南](./03-governance/03-migration-onboarding-guide/) | 旧系统迁移、新应用接入、用户映射、回滚方案 |

## 建议评审顺序

1. 先评审 01，确认总体架构和边界。
2. 再评审 02，确认 Next.js 门户和管理后台职责。
3. 评审 03、04、05，确认认证、用户模型、Keycloak 配置。
4. 评审 06、07，确认前端体验和 API 是否匹配。
5. 评审 08、09，确认同步一致性和安全控制。
6. 最后评审 10、11、12，确认上线、运维、迁移路径和代码组织。

## 核心设计原则

```text
统一身份，不强行统一所有业务权限
```

具体边界：

- Keycloak 管身份认证、账号生命周期、MFA、SSO 和认证侧应用准入投影。
- Next.js 管统一门户体验、管理后台、服务端管理接口、用户生命周期编排和管理操作审计。
- 平台权限中心只管跨应用共享授权事实，例如应用目录、应用准入、平台组织目录、管理后台权限和跨应用授权投影。
- 各业务系统管应用域业务权限、资源级权限、数据访问控制和业务审计。
- 用户自助注册默认需要管理员审批；审批通过后仍需单独分配应用准入和应用角色。
- Supabase 只是业务应用之一；统一身份平台不详细设计 Supabase 或其他业务应用内部表结构。
- 跨系统用户主键使用 Keycloak `sub`，不使用 email。
- 应用准入事实源在统一身份平台数据库，Keycloak Client Role 是认证侧准入投影。
- Keycloak Group 用于组织、部门、批量管理和管理员分组，不作为应用准入事实源。
- 主数据库使用 PostgreSQL，设计需兼容 KingbaseES PostgreSQL 兼容模式。
- MQ 常规部署优先 RabbitMQ Quorum Queue，设计需通过 MQ adapter 兼容国产化/信创 MQ 替换。

## 当前文档状态

这些文档是目标态架构设计。

进入实施方案时，应另行细化：

- 数据库 DDL。
- OpenAPI/接口契约。
- Keycloak 实际配置导出。
- 前端高保真原型。
- 测试用例。
- 上线 runbook。

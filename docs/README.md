---
docType: doc-entry
scope: repo
status: active
authoritative: true
owner: identity-center
language: zh
whenToUse: 需要定位统一身份平台文档集入口(设计文档集、实施方案、runbook、接入指南)时阅读本文档。
whenToUpdate: 文档目录结构或入口链接发生变化时更新本文档。
checkPaths:
  - docs/README.md
  - docs/design/README.md
  - docs/implementation/README.md
lastReviewedAt: 2026-07-09
lastReviewedCommit: 8687ad4f6cda360a7f0336d9137a592d7e022987
---

# Identity Platform 文档

本文档目录用于沉淀统一身份平台相关资料。

当前内容入口：

- [设计文档集](./design/README.md) — 目标态架构设计（已通过评审）
- [实施方案](./implementation/README.md) — 实施顺序、里程碑、范围裁剪与验收标准
- [部署/启动/运行 Runbook](../identity-portal/deploy/runbooks/README.md) — 从零到运行的完整操作手册（含 5 份专项手册）
- [业务应用接入指南](./guides/business-app-onboarding.md) — 新应用接入十步与验收清单
- [业务应用接入技术规范](./guides/business-app-integration-spec.md) — 接入契约（API / 数据模型 / 校验）
- [业务应用 SSO 接入说明书](./guides/sso-integration-handbook.md) — 实战版接入指南（基于 CMS 经验）

## 目录结构

```text
docs/
├─ README.md
├─ design/
│  ├─ README.md
│  ├─ 01-architecture/   架构设计
│  ├─ 02-application/    应用设计
│  └─ 03-governance/     治理设计
└─ implementation/
   └─ README.md          实施方案
```

设计文档采用“一篇文档一个目录”的组织方式：

```text
01-overall-architecture/
├─ README.md
└─ _assets/
   └─ diagram-01-overview.png
```

后续如果进入实施阶段，可以再新增：

```text
docs/runbooks/        上线、回滚、故障处理步骤
docs/decisions/       ADR 架构决策记录
docs/guides/          开发、部署、业务应用接入指南
docs/references/      外部系统、接口、配置参考
```

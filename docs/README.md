# Identity Platform 文档

本文档目录用于沉淀统一身份平台相关资料。

当前已有内容全部属于设计文档，入口见：

- [设计文档集](./design/README.md)

## 目录结构

```text
docs/
├─ README.md
└─ design/
   ├─ README.md
   ├─ 01-architecture/   架构设计
   ├─ 02-application/    应用设计
   └─ 03-governance/     治理设计
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

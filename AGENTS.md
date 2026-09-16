---
docType: agent-entry
scope: repo
status: active
authoritative: true
owner: identity-center
language: zh
whenToUse: 在本仓库开展任何代理工作前阅读本文档，定位权威契约入口、工作区/独立双语境边界与质量门。
whenToUpdate: 契约入口、工作区集成方式或质量门命令变化时更新本文档。
checkPaths:
  - AGENTS.md
  - docs/README.md
  - identity-portal/AGENTS.md
lastReviewedAt: 2026-09-16
lastReviewedCommit: 50eff892cd98671e2556cacebe5a72ec198ee0f9
---

# identity-center 代理入口

本仓库拥有**统一身份平台（身份中心 / SSO 服务）**：Keycloak + Next.js 统一登录/SSO、注册审批、用户/应用/准入/角色、事件同步管道与审计。架构与行为的最高依据是已评审的 `docs/design/` 设计文档集（勿改；缺口记录到 `docs/implementation/decisions.md`）。本文件只是薄入口，不复述任何设计内容，不改变任何生产身份语义。

## 契约入口

| 主题 | 入口 |
|---|---|
| 交付目标、硬性不变量（§4）与边界禁区（§8） | [GOAL.md](GOAL.md) |
| 文档集总入口 | [docs/README.md](docs/README.md) |
| 当前实施契约（顺序/范围/验收/进度） | [docs/implementation/README.md](docs/implementation/README.md)；决定记录 [decisions.md](docs/implementation/decisions.md)；完成定义 [definition-of-done.md](docs/implementation/definition-of-done.md) |
| 代码层代理规则 | [identity-portal/AGENTS.md](identity-portal/AGENTS.md)（写 identity-portal 代码前先读） |

## 语境边界

- **Workspace 语境**：本仓库以 M1 子仓进入 tiangong-lca/workspace。root 集成、交付路由、PR 与 Project 状态一律遵循工作区控制器（workspace 仓 `scripts/workspace-ops` 及 workspace-delivery 工作流）；不在本仓内自行发起绕过控制器的集成或交付动作。
- **Standalone 语境**：本仓独立开发与交付时，保持本仓契约——GOAL.md、docs/implementation、issue 驱动协作（GOAL.md §5 第 6 条）与 `.docpact/` 治理。

## 质量门

命令均在 `identity-portal/` 下执行（依赖按 lockfile 由 pnpm 安装）：

```bash
pnpm install --frozen-lockfile
pnpm lint        # ESLint（含分层依赖边界规则）
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest unit
```

需要容器（Keycloak/DB/MQ）的集成与 e2e 门按 GOAL.md §6 与 docs/implementation 执行；日常默认不启动数据库/Keycloak/docker。

## Docpact

仓库本地治理配置见 [.docpact/config.yaml](.docpact/config.yaml)；用 workspace 根的 `scripts/docpact <cmd> --root <本仓绝对路径>` 评估本仓的文档漂移门。

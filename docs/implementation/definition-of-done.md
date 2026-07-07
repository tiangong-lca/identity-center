---
docType: dod-checklist
scope: repo
status: active
authoritative: true
owner: identity-center
language: zh
whenToUse: 需要核对一期交付是否满足 GOAL.md §7 完成定义的各项条目及证据时阅读本文档。
whenToUpdate: 完成定义条目、验收标准或核对证据发生变化时更新本文档。
checkPaths:
  - docs/implementation/definition-of-done.md
  - GOAL.md
lastReviewedAt: 2026-07-07
lastReviewedCommit: 3cba77d
---

# 完成定义(DoD)核对 — GOAL.md §7

> 核对日期 2026-07-02。逐项附证据。

| # | 完成定义 | 状态 | 证据 |
|---|---|---|---|
| 1 | compose 一键起全部服务健康;bootstrap 可从零重建 realm | ✅ | `docker-compose.dev.yml` 五服务 healthy;`bootstrap-keycloak-realm.ts` 幂等重建 + `--export`(`keycloak-bootstrap.test.ts` 验证 OIDC discovery + PKCE) |
| 2 | 迁移在 PostgreSQL 从零成功 + 集成全绿;KES 交付约定+adapter+矩阵(D-001) | ✅(KES 实测待环境) | PG:`migrations.test.ts` 从零建库 20 表 + 约束;KES 三件套就绪,环境不可得记于 `kingbasees-environment.md` |
| 3 | lint/typecheck/unit/integration + Playwright e2e 全绿 | ✅ | 37 unit + 63 integration + 8 e2e(登录/禁用/准入授予撤销/注册审批/语言/主题切换);目录待停用能力补充 unit(secret-scan、serialize-deactivated)+ integration(catalog-p3)+ e2e(catalog-pending-deactivate) |
| 4 | 端到端:注册→审批→开通→准入→角色→同步→登录 Supabase;撤权后拒绝、对账无差异 | ✅ | `e2e-onboarding.test.ts` 全链路 + business-app-kit verifier 放行/拒绝 + 对账 drift=0 |
| 5 | 全 UI zh-CN/en + light/dark 无硬编码文案/主题遗漏 | ✅ | next-intl 目录合并制 + messages-parity 测试(键一致/无空串);next-themes data-theme;e2e 切换用例;设计库 token 桥接 |
| 6 | OpenAPI 契约与实现一致;每写操作产审计 | ✅ | `docs/references/openapi.yaml`(全端点 + 错误码 components);契约测试断言审计行 |
| 7 | 安全清单 17/17 留档;PII 加密;限流与 CSRF 生效 | ✅ | `security-checklist-signoff.md` 17/17;`pii-encryption.test.ts`;`rate-limit.test.ts`;契约 CSRF_REJECTED |
| 8 | 备份脚本可执行 + 恢复演练成功;监控告警就位;5 runbook | ✅ | 演练:dev 库备份→新库恢复→20 表/5 角色校验通过;`deploy/monitoring/alerts.md`;`deploy/runbooks/` 5 份 |
| 9 | prod compose 可完成生产形态部署(HTTPS/secrets 说明齐备) | ✅ | `docker-compose.prod.yml` + 多阶段 `Dockerfile`(standalone,server.js 路径规整);deployment.md secrets/反代说明 |
| 10 | 进度表 8 层全完成 + 对应 commit;全部提交 git | ✅ | 实施方案 §9 L0-L7 全标记完成;各层 push 到 main;CI lint/typecheck/unit 通过 |

## 上线前运维交接项(非代码,由部署方执行)
- 生产 secret 注入(AUTH_SECRET / DB / Keycloak / PII_ENCRYPTION_KEY / Webhook secret)
- HTTPS 反代(Nginx/Caddy)终止 + X-Forwarded 头
- Turnstile/hCaptcha 生产站点密钥(`CAPTCHA_PROVIDER`/`CAPTCHA_SECRET`)
- 监控 exporter 接线到生产 Prometheus/Alertmanager
- KES 双库实测(具备 x86 主机或官方授权镜像时,`KES_ENABLED=1 pnpm test:integration`)

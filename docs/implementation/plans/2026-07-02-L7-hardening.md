# L7 安全加固与上线 Implementation Plan

**Goal:** 满足安全设计 §16 全部 17 项;PII 列加密落地;降级策略验证;生产 compose;备份/恢复演练;监控告警;5 份 runbook。

## Tasks
### T1 安全中间件补强(proxy.ts)+ 安全响应头
- `proxy.ts`(Next 16 中间件更名):安全响应头(HSTS/X-Content-Type-Options/X-Frame-Options DENY/Referrer-Policy/CSP);/admin 未登录快速重定向(体验层,服务端 layout 已守卫)。
- 单测:头存在性。

### T2 PII 列加密落地
- `portal_users.phone`(加密列)示范:repository 写入用 lib/crypto 加密、读出解密;env PII_ENCRYPTION_KEY(schema 必填于生产、dev 可选)。schema 增列 + 迁移。
- 集成测试:phone 密文入库(DB 原值非明文)、读出还原。

### T3 Keycloak 降级策略验证(可测部分)
- `lib/keycloak/degradation.ts`:门户管理写操作在 Keycloak 不可用(健康探测失败)时返回 503 的判定 helper;记录降级审计。
- 单测 + 复用 e2e-onboarding 的 broken-KC 注入验证写操作 503 路径(集成)。

### T4 验证码可配置开关
- `lib/security/captcha.ts`:Turnstile/hCaptcha 校验(env 配置;未配置=开发直通),登录/注册 publicRoute 接线点(注册接线)。
- 单测:开关行为。

### T5 生产 compose + secrets
- `deploy/docker/docker-compose.prod.yml`:去 dev 默认口令(env_file/secrets 注入)、资源限制、Portal 服务(构建镜像)、Keycloak start(非 dev)+ HTTPS 反代说明、healthcheck。
- `deploy/docker/Dockerfile`(Portal 多阶段构建,standalone 输出)。next.config output: 'standalone'。

### T6 备份/恢复脚本 + 演练
- `deploy/runbooks/` 5 份:deployment / rollback / keycloak-client-secret-rotation / database-backup-restore / incident-response。
- `scripts/backup-db.sh` + `scripts/restore-db.sh`(pg_dump/pg_restore);演练:备份 dev 平台库 → 新库恢复 → 校验表数(记录到 reference)。

### T7 监控告警配置基线
- `deploy/monitoring/alerts.md`:指标与阈值(事件积压>1000、死信增长、Webhook 失败率>1%、投影失败、登录失败率、证书过期);/api/health 已就绪。

### T8 安全清单核对 + 双库终验 + 收尾
- `docs/references/security-checklist-signoff.md`:17 项逐条,标注实现位置与验证证据(测试名/文件)。
- 双库终验:KES amd64 环境可得则 `KES_ENABLED=1` 跑迁移+核心矩阵;不可得则如实记录(D-001)。
- 全量 gate + 进度表 L7 完成 + DoD 逐条核对 + commit + push。

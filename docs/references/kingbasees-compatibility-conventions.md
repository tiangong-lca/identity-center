---
docType: reference
scope: repo
status: active
authoritative: true
owner: identity-center
language: zh
whenToUse: 编写或审查 identity-portal/db/**、server/repositories/** 或任何生成 SQL 的代码前，需要确认 KingbaseES 兼容约定时阅读本文档。
whenToUpdate: KingbaseES 兼容约定或数据层强制规范发生变化时更新本文档。
checkPaths:
  - docs/references/kingbasees-compatibility-conventions.md
  - docs/references/kingbasees-environment.md
lastReviewedAt: 2026-07-07
lastReviewedCommit: 3cba77d
---

# KingbaseES 兼容约定(数据层强制规范)

> 适用:`identity-portal/db/**`、`server/repositories/**` 及一切生成 SQL 的代码。
> 状态:D-001 下 KES 实测非阻塞,但本约定**始终强制**——这是"环境可得后一键补验"成立的前提。
> Code review 检查项:改动涉及 schema/查询时逐条核对本清单。

## 强制规则

1. **UUID 应用侧生成**:`$defaultFn(() => crypto.randomUUID())`;禁止 `gen_random_uuid()`/`uuid-ossp`/`pgcrypto`。
2. **禁止 PG ENUM**:状态列一律 `text` + TS 联合类型注释 + zod 校验(服务层)。
3. **禁止部分唯一索引与 `NULLS NOT DISTINCT`**:可空维度参与唯一键时用 `NOT NULL DEFAULT ''` 归一化(见 `application_user_roles.scope_id`、`admin_user_roles.scope_id`)。
4. **jsonb 限基础读写**:整列读写允许;禁止 `@>`、`?|`、`jsonb_path_*` 等高级操作符进入核心查询路径。
5. **时间列** `timestamptz` + `now()` 默认;`updated_at` 由应用层赋值。
6. **禁止依赖 PG 扩展**(postgis/pg_trgm/citext 等)与 `GENERATED ... AS IDENTITY`(主键统一 uuid)。
7. **迁移 SQL 走查**:每次 `drizzle-kit generate` 后检查产物无上述违禁项(L1 已验证 0000_init.sql)。
8. **驱动统一 `pg`**:KES 走 PostgreSQL 兼容模式同一驱动(thin adapter `lib/db/client.ts`,连接串切换)。

## 双库矩阵使用

```bash
pnpm test:integration                 # PG(必跑)
KES_ENABLED=1 KINGBASE_ADMIN_URL=postgres://kingbase:kingbase@localhost:54321/test \
  pnpm test:integration               # KES 环境可得后补验(D-001)
```

矩阵实现:`tests/integration/helpers/db-targets.ts`(migrations/repositories 测试 `describe.each(getDbTargets())`)。

## 已知风险点(补验时重点核对)

- `DROP DATABASE ... WITH (FORCE)`(测试 helper 用)为 PG13+ 语法,KES 兼容性待验;不可用时降级为先断连接再 DROP。
- `RETURNING` 子句(Drizzle insert/update 使用)在 KES V8R6 兼容模式的支持范围。
- `information_schema.tables` 断言在 KES 的 schema 语义差异。

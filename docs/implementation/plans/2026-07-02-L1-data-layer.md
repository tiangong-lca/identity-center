# L1 数据层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans,逐任务执行,checkbox 跟踪。

**Goal:** 20 张表的 Drizzle schema + 迁移 + 幂等 seed(含初始管理员引导)+ 基础 repositories,PG 实测全绿,KES thin adapter 与参数化矩阵就绪(D-001)。

**Architecture:** schema 按业务模块拆分于 `db/schema/*`;`lib/db` 提供连接工厂(thin adapter,D-001);迁移由 drizzle-kit 生成 SQL 文件,集成测试每次从零建库执行迁移验证;seed 通过 Keycloak Admin API + DB 写入完成种子管理员闭环。

**Tech Stack:** drizzle-orm 0.45.x(稳定线,v1 beta 不用)+ drizzle-kit 配套稳定版 + pg(node-postgres,KES 兼容模式同驱动)。

## Global Constraints(KES 兼容约定,同时落 `docs/references/` 成文)

- **UUID 由应用生成**(`crypto.randomUUID()` + `$defaultFn`),不依赖 `gen_random_uuid()`/pgcrypto。
- **不用 PG ENUM**(`CREATE TYPE ... AS ENUM`),状态列一律 `text` + TS 联合类型 + zod 校验。
- **不用部分唯一索引 / NULLS NOT DISTINCT**;scope 类唯一键用 `scope_id text NOT NULL DEFAULT ''` 归一化。
- jsonb 允许(基础读写),查询禁用高级 jsonb 操作符路径。
- 时间列 `timestamptz`,默认 `now()`;`updated_at` 由应用层更新。
- 外键允许;命名 snake_case;主键统一 `id uuid`。
- 回滚策略(成文):Drizzle 无 down 迁移——dev 环境从零重建,prod 仅前滚 + 恢复自备份;验收以"从零可重复 + 已应用幂等跳过"为准。

## 表清单(20 张,字段依据设计文档 04-user-permission-model / 03-sync-event-design)

| 模块文件 | 表 |
|---|---|
| `db/schema/users.ts` | `portal_users`(id, keycloak_sub UNIQUE, keycloak_user_id, email, display_name, status[active/disabled/pending_deprovision/deleted], sync_status, metadata jsonb, created_at, updated_at)、`registration_requests`(id, email, display_name, requested_organization_id FK→platform_organizations 可空, requested_reason, status[pending/approved/rejected/cancelled], approval_required bool, portal_user_id FK 可空, keycloak_sub 可空, reviewed_by, reviewed_at, review_comment, created_at, updated_at) |
| `db/schema/applications.ts` | `applications`(id, code UNIQUE, name, keycloak_client_id, access_client_role, status, login_url, admin_url, webhook_url, webhook_secret_ref, metadata jsonb, timestamps)、`application_roles`(id, application_id FK, code, name, description, status, timestamps, UNIQUE(application_id, code))、`application_assignments`(id, application_id FK, portal_user_id FK, keycloak_sub, status[active/revoked/expired], source, expires_at, projection_status[pending/projected/failed], last_projection_error, projected_at, business_projection_status, last_business_projection_error, business_projected_at, timestamps, UNIQUE(application_id, portal_user_id))、`application_user_roles`(id, application_id FK, application_role_id FK, portal_user_id FK, keycloak_sub, scope_type text default 'global', scope_id text NOT NULL default '', status, source, expires_at, projection_status, last_projection_error, projected_at, timestamps, UNIQUE(application_id, application_role_id, portal_user_id, scope_type, scope_id)) |
| `db/schema/organizations.ts` | `platform_tenants`(id, code UNIQUE, name, status, metadata, timestamps)、`platform_tenant_members`(id, tenant_id FK, portal_user_id FK, member_type, status, timestamps, UNIQUE(tenant_id, portal_user_id))、`platform_organizations`(id, tenant_id FK 可空, parent_id 自引用可空, code UNIQUE, name, type[company/department/business_unit/team], status, metadata, timestamps)、`platform_organization_members`(id, organization_id FK, portal_user_id FK, member_type[member/manager/owner], status, joined_at, left_at, timestamps, UNIQUE(organization_id, portal_user_id))、`business_app_organization_mappings`(id, platform_organization_id FK, application_id FK, business_app_org_id, mapping_type, status, timestamps, UNIQUE(platform_organization_id, application_id)) |
| `db/schema/admin-rbac.ts` | `admin_roles`(id, code UNIQUE, name, description, built_in bool, timestamps)、`admin_permissions`(id, code UNIQUE, name, description, timestamps)、`admin_role_permissions`(admin_role_id FK, admin_permission_id FK, PK(两列))、`admin_user_roles`(id, portal_user_id FK, admin_role_id FK, scope_type default 'global', scope_id text NOT NULL default '', timestamps, UNIQUE(portal_user_id, admin_role_id, scope_type, scope_id)) |
| `db/schema/audit.ts` | `audit_logs`(id, actor_keycloak_sub, actor_email, action, target_type, target_id, before_data jsonb, after_data jsonb, result, failure_reason, ip, user_agent, request_id, trace_id, operation_id, record_hash, previous_hash, created_at;索引:created_at、actor_keycloak_sub、(target_type,target_id)) |
| `db/schema/events.ts` | `outbox_events`(id, event_type, event_version int default 1, payload jsonb, trace_id, operation_id, status[pending/published/failed], attempts int default 0, last_error, published_at, created_at;索引(status, created_at))、`webhook_deliveries`(id, application_id FK, event_id, event_type, payload jsonb, status[pending/delivered/failed/dead], attempts, last_error, next_retry_at, delivered_at, timestamps;索引(status, next_retry_at))、`dead_letter_events`(id, source[outbox/webhook/consumer], event_id, event_type, event_version, payload jsonb, consumer, error, attempts, trace_id, operation_id, created_at, resolved_at)、`processed_events`(event_id, consumer, processed_at, PK(event_id, consumer)) |

## Tasks

### Task 1: 依赖 + thin adapter + drizzle 配置
- `pnpm add drizzle-orm pg` `pnpm add -D drizzle-kit @types/pg`
- `lib/db/client.ts`:`createDbClient(connectionString)` → `{ db, pool, close() }`(drizzle(node-postgres));`lib/db/index.ts` 惰性单例(env `DATABASE_URL`)。**这是 D-001 thin adapter:KES 仅换连接串。**
- `drizzle.config.ts`:schema `./db/schema`,out `./db/migrations`,dialect postgresql。
- 版本记录追加到 `docs/references/`。验收:typecheck 过。commit。

### Task 2: 全部 schema + 公共列 helper
- `db/schema/_shared.ts`:`uuidPk()`(`uuid('id').primaryKey().$defaultFn(() => crypto.randomUUID())`)、`timestamps`(created_at/updated_at timestamptz default now())。
- 按上表实现 6 个模块文件 + `db/schema/index.ts` barrel。验收:typecheck;`drizzle-kit generate` 产出迁移 SQL,人工走查无 ENUM/无 gen_random_uuid。commit。

### Task 3: 迁移集成测试(从零建库)
- `tests/integration/helpers/test-db.ts`:管理连接(postgres/postgres)`CREATE DATABASE identity_test_<hex>` → migrate(drizzle-orm/node-postgres/migrator)→ 返回 client + drop 回调。
- `tests/integration/migrations.test.ts`:从零迁移成功;重复 migrate 幂等;20 张表存在(information_schema 断言);关键唯一约束生效(插重复 keycloak_sub / (event_id,consumer) 报错)。验收:PG 上全绿。commit。

### Task 4: seed 脚本(幂等)
- `scripts/seed-portal-db.ts`:
  1. 内置 5 角色(platform_admin/user_admin/app_admin/auditor/support,built_in=true);
  2. 权限清单(user:read/user:create/user:update/user:disable/user:enable/user:reset-password/user:reset-mfa、app:read/app:create/app:update/app:assign/app:revoke、role:read/role:manage、org:read/org:manage、registration:read/registration:review、audit:read、admin-role:read/admin-role:manage、settings:read/settings:manage);
  3. 角色-权限映射(platform_admin=全部;user_admin=user:*+registration:*;app_admin=app:*+role:*;auditor=audit:read+*:read;support=user:read+user:reset-password+user:reset-mfa);
  4. 种子管理员:Keycloak(company-dev)确保用户 `admin@identity.local`(临时密码,首登改密)+ realm roles admin_console_access/platform_admin → 镜像 `portal_users` → `admin_user_roles`(platform_admin,global)。
- `tests/integration/seed.test.ts`:跑两遍结果一致(幂等);角色/权限/映射计数断言;portal_users 有种子管理员且 keycloak_sub 非空。commit。

### Task 5: repositories 基础 + 分页 helper
- `lib/db/pagination.ts`:`paginate(page,pageSize)` → limit/offset + `buildPageResult(items,total,page,pageSize)`。
- `server/repositories/portal-users-repository.ts`:create/findById/findByKeycloakSub/updateStatus/list(keyword ilike email/display_name + status 过滤 + 分页排序)。
- `server/repositories/audit-log-repository.ts`:append(含 hash 链:record_hash=sha256(previous_hash+canonical(record)))/list 分页过滤。
- `tests/integration/repositories.test.ts`:CRUD + 分页 + hash 链连续性断言。commit。

### Task 6: KES 参数化矩阵 + 兼容约定成文
- `tests/integration/helpers/db-targets.ts`:`targets = [{name:'pg', url: DATABASE_URL_admin}, ...(process.env.KES_ENABLED==='1' ? [{name:'kes', url: KINGBASE_URL}] : [])]`;migrations/repositories 测试改为 describe.each(targets)。
- `docs/references/kingbasees-compatibility-conventions.md`:上方 Global Constraints 全文成文 + review 检查项。
- 验收:PG 目标全绿;`KES_ENABLED=1` 时矩阵结构就绪(不实跑,D-001)。commit。

### Task 7: L1 验收 + 进度表
- 全量 gate:lint/typecheck/unit/integration;进度表 L1 行更新;commit + push。

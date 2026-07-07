import { index, jsonb, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { pgTable } from 'drizzle-orm/pg-core'
import { timestamps, uuidPk } from './_shared'
import { portalUsers } from './users'

/** 已接入业务应用目录 */
export const applications = pgTable('applications', {
  id: uuidPk(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  keycloakClientId: text('keycloak_client_id').notNull(),
  /** 认证侧准入投影的 Client Role 名(如 tiangong_lca_access) */
  accessClientRole: text('access_client_role').notNull(),
  /** active | disabled | pending_deactivate | deactivated(pending_deactivate 由 catalog reconcile 置待人工确认;deactivated 为确认停用后的终态墓碑) */
  status: text('status').notNull().default('active'),
  loginUrl: text('login_url'),
  adminUrl: text('admin_url'),
  webhookUrl: text('webhook_url'),
  /** Webhook secret 的密钥引用(env/密钥管理键名),不存明文 */
  webhookSecretRef: text('webhook_secret_ref'),
  metadata: jsonb('metadata'),
  ...timestamps(),
})

/** 应用可分配角色目录(平台侧事实;角色具体权限由业务应用定义) */
export const applicationRoles = pgTable(
  'application_roles',
  {
    id: uuidPk(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /** active | disabled | pending_deactivate | deactivated(pending_deactivate 由 catalog reconcile 置待人工确认;deactivated 为确认停用后的终态墓碑) */
    status: text('status').notNull().default('active'),
    ...timestamps(),
  },
  (t) => [uniqueIndex('application_roles_app_code_uq').on(t.applicationId, t.code)],
)

/** 应用准入事实源(Keycloak Client Role 只是投影) */
export const applicationAssignments = pgTable(
  'application_assignments',
  {
    id: uuidPk(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    portalUserId: uuid('portal_user_id')
      .notNull()
      .references(() => portalUsers.id),
    keycloakSub: text('keycloak_sub').notNull(),
    /** active | revoked | expired */
    status: text('status').notNull().default('active'),
    /** admin | registration | migration | api */
    source: text('source').notNull().default('admin'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** Keycloak 投影:pending | projected | failed */
    projectionStatus: text('projection_status').notNull().default('pending'),
    lastProjectionError: text('last_projection_error'),
    projectedAt: timestamp('projected_at', { withTimezone: true }),
    /** 业务应用投影:pending | projected | failed | not_required */
    businessProjectionStatus: text('business_projection_status')
      .notNull()
      .default('pending'),
    lastBusinessProjectionError: text('last_business_projection_error'),
    businessProjectedAt: timestamp('business_projected_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('application_assignments_uq').on(t.applicationId, t.portalUserId),
    index('application_assignments_status_idx').on(t.status),
    index('application_assignments_projection_idx').on(t.projectionStatus),
  ],
)

/** 用户在应用中的角色分配(平台侧事实;scope_id 用 '' 表示 global,保证唯一键可移植) */
export const applicationUserRoles = pgTable(
  'application_user_roles',
  {
    id: uuidPk(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    applicationRoleId: uuid('application_role_id')
      .notNull()
      .references(() => applicationRoles.id),
    portalUserId: uuid('portal_user_id')
      .notNull()
      .references(() => portalUsers.id),
    keycloakSub: text('keycloak_sub').notNull(),
    /** global | tenant | org | team | project */
    scopeType: text('scope_type').notNull().default('global'),
    scopeId: text('scope_id').notNull().default(''),
    /** active | revoked | expired */
    status: text('status').notNull().default('active'),
    source: text('source').notNull().default('admin'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    projectionStatus: text('projection_status').notNull().default('pending'),
    lastProjectionError: text('last_projection_error'),
    projectedAt: timestamp('projected_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('application_user_roles_uq').on(
      t.applicationId,
      t.applicationRoleId,
      t.portalUserId,
      t.scopeType,
      t.scopeId,
    ),
    index('application_user_roles_status_idx').on(t.status),
  ],
)

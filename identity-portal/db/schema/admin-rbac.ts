import { boolean, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { pgTable } from 'drizzle-orm/pg-core'
import { timestamps, uuidPk } from './_shared'
import { portalUsers } from './users'

/** 管理后台本地角色(内置:platform_admin/user_admin/app_admin/auditor/support) */
export const adminRoles = pgTable('admin_roles', {
  id: uuidPk(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  builtIn: boolean('built_in').notNull().default(false),
  ...timestamps(),
})

/** 管理后台权限清单(code 如 user:disable、app:assign、audit:read) */
export const adminPermissions = pgTable('admin_permissions', {
  id: uuidPk(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  ...timestamps(),
})

export const adminRolePermissions = pgTable(
  'admin_role_permissions',
  {
    adminRoleId: uuid('admin_role_id')
      .notNull()
      .references(() => adminRoles.id),
    adminPermissionId: uuid('admin_permission_id')
      .notNull()
      .references(() => adminPermissions.id),
  },
  (t) => [primaryKey({ columns: [t.adminRoleId, t.adminPermissionId] })],
)

/** 管理员角色绑定(scope_id 用 '' 表示 global) */
export const adminUserRoles = pgTable(
  'admin_user_roles',
  {
    id: uuidPk(),
    portalUserId: uuid('portal_user_id')
      .notNull()
      .references(() => portalUsers.id),
    adminRoleId: uuid('admin_role_id')
      .notNull()
      .references(() => adminRoles.id),
    /** global | org | app */
    scopeType: text('scope_type').notNull().default('global'),
    scopeId: text('scope_id').notNull().default(''),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('admin_user_roles_uq').on(t.portalUserId, t.adminRoleId, t.scopeType, t.scopeId),
  ],
)

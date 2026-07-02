import { index, jsonb, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { pgTable, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { timestamps, uuidPk } from './_shared'
import { applications } from './applications'
import { portalUsers } from './users'

/** 租户目录(D-001 范围说明:表建立,启用为部署配置项) */
export const platformTenants = pgTable('platform_tenants', {
  id: uuidPk(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  /** active | disabled */
  status: text('status').notNull().default('active'),
  metadata: jsonb('metadata'),
  ...timestamps(),
})

export const platformTenantMembers = pgTable(
  'platform_tenant_members',
  {
    id: uuidPk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => platformTenants.id),
    portalUserId: uuid('portal_user_id')
      .notNull()
      .references(() => portalUsers.id),
    memberType: text('member_type').notNull().default('member'),
    status: text('status').notNull().default('active'),
    ...timestamps(),
  },
  (t) => [uniqueIndex('platform_tenant_members_uq').on(t.tenantId, t.portalUserId)],
)

/** 平台组织目录(层级:company/department/business_unit/team) */
export const platformOrganizations = pgTable(
  'platform_organizations',
  {
    id: uuidPk(),
    tenantId: uuid('tenant_id').references(() => platformTenants.id),
    parentId: uuid('parent_id').references((): AnyPgColumn => platformOrganizations.id),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    /** company | department | business_unit | team */
    type: text('type').notNull().default('department'),
    status: text('status').notNull().default('active'),
    metadata: jsonb('metadata'),
    ...timestamps(),
  },
  (t) => [index('platform_organizations_parent_idx').on(t.parentId)],
)

export const platformOrganizationMembers = pgTable(
  'platform_organization_members',
  {
    id: uuidPk(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => platformOrganizations.id),
    portalUserId: uuid('portal_user_id')
      .notNull()
      .references(() => portalUsers.id),
    /** member | manager | owner */
    memberType: text('member_type').notNull().default('member'),
    status: text('status').notNull().default('active'),
    joinedAt: timestamp('joined_at', { withTimezone: true }),
    leftAt: timestamp('left_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('platform_organization_members_uq').on(t.organizationId, t.portalUserId),
  ],
)

/** 平台组织 ↔ 业务应用本地组织映射 */
export const businessAppOrganizationMappings = pgTable(
  'business_app_organization_mappings',
  {
    id: uuidPk(),
    platformOrganizationId: uuid('platform_organization_id')
      .notNull()
      .references(() => platformOrganizations.id),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    businessAppOrgId: text('business_app_org_id').notNull(),
    mappingType: text('mapping_type').notNull().default('direct'),
    status: text('status').notNull().default('active'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('business_app_org_mappings_uq').on(t.platformOrganizationId, t.applicationId),
  ],
)

import { boolean, index, jsonb, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { pgTable } from 'drizzle-orm/pg-core'
import { timestamps, uuidPk } from './_shared'

/** 平台用户总表:不保存密码,不作为认证源;keycloak_sub 是跨系统身份键 */
export const portalUsers = pgTable(
  'portal_users',
  {
    id: uuidPk(),
    keycloakSub: text('keycloak_sub').notNull(),
    keycloakUserId: text('keycloak_user_id'),
    email: text('email').notNull(),
    displayName: text('display_name'),
    /** PII:手机号,AES-256-GCM 密文存储(lib/crypto),明文不落库 */
    phoneEncrypted: text('phone_encrypted'),
    /** active | disabled | pending_deprovision | deleted */
    status: text('status').notNull().default('active'),
    /** in_sync | pending | failed */
    syncStatus: text('sync_status').notNull().default('in_sync'),
    metadata: jsonb('metadata'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('portal_users_keycloak_sub_uq').on(t.keycloakSub),
    index('portal_users_email_idx').on(t.email),
    index('portal_users_status_idx').on(t.status),
  ],
)

/** 用户注册申请与审批记录 */
export const registrationRequests = pgTable(
  'registration_requests',
  {
    id: uuidPk(),
    email: text('email').notNull(),
    displayName: text('display_name'),
    /** 申请加入的组织(软引用 platform_organizations.id,不设 FK 以避免申请记录受组织生命周期约束) */
    requestedOrganizationId: uuid('requested_organization_id'),
    requestedReason: text('requested_reason'),
    /** pending | approved | rejected | cancelled */
    status: text('status').notNull().default('pending'),
    approvalRequired: boolean('approval_required').notNull().default(true),
    portalUserId: uuid('portal_user_id').references(() => portalUsers.id),
    keycloakSub: text('keycloak_sub'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewComment: text('review_comment'),
    ...timestamps(),
  },
  (t) => [
    index('registration_requests_status_idx').on(t.status),
    index('registration_requests_email_idx').on(t.email),
  ],
)

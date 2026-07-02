import { index, jsonb, text } from 'drizzle-orm/pg-core'
import { pgTable } from 'drizzle-orm/pg-core'
import { createdAt, uuidPk } from './_shared'

/**
 * 管理操作审计日志(append-only):
 * 应用层只 INSERT;record_hash = sha256(previous_hash + canonical(record)) 构成 hash 链防篡改。
 * 保留策略:高危 3 年、普通 1 年(归档任务在 L3 交付)。
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuidPk(),
    actorKeycloakSub: text('actor_keycloak_sub').notNull(),
    actorEmail: text('actor_email'),
    /** 如 user.disable / app.assign_user / role.grant */
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    beforeData: jsonb('before_data'),
    afterData: jsonb('after_data'),
    /** success | failure */
    result: text('result').notNull().default('success'),
    failureReason: text('failure_reason'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    requestId: text('request_id'),
    traceId: text('trace_id'),
    operationId: text('operation_id'),
    recordHash: text('record_hash').notNull(),
    previousHash: text('previous_hash'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_logs_created_idx').on(t.createdAt),
    index('audit_logs_actor_idx').on(t.actorKeycloakSub),
    index('audit_logs_target_idx').on(t.targetType, t.targetId),
    index('audit_logs_action_idx').on(t.action),
  ],
)

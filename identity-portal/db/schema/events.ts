import { index, integer, jsonb, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { pgTable } from 'drizzle-orm/pg-core'
import { createdAt, timestamps, uuidPk } from './_shared'
import { applications } from './applications'

/** Outbox:平台事实变更与事实表同事务写入,是事件管道的可靠源头 */
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuidPk(),
    /** 如 identity.user.disabled / access.application.granted(12 类,见同步与事件设计) */
    eventType: text('event_type').notNull(),
    eventVersion: integer('event_version').notNull().default(1),
    payload: jsonb('payload').notNull(),
    traceId: text('trace_id'),
    operationId: text('operation_id'),
    /** pending | published | failed */
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('outbox_events_status_created_idx').on(t.status, t.createdAt)],
)

/** Webhook 投递记录(签名投递到业务应用,指数退避重试 5 次) */
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuidPk(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    eventId: text('event_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    /** pending | delivered | failed | dead */
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index('webhook_deliveries_status_retry_idx').on(t.status, t.nextRetryAt),
    index('webhook_deliveries_event_idx').on(t.eventId),
  ],
)

/** 死信:消费/投递重试耗尽后进入,告警人工处理 */
export const deadLetterEvents = pgTable(
  'dead_letter_events',
  {
    id: uuidPk(),
    /** outbox | webhook | consumer */
    source: text('source').notNull(),
    eventId: text('event_id').notNull(),
    eventType: text('event_type').notNull(),
    eventVersion: integer('event_version').notNull().default(1),
    payload: jsonb('payload').notNull(),
    consumer: text('consumer'),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    traceId: text('trace_id'),
    operationId: text('operation_id'),
    createdAt: createdAt(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [index('dead_letter_events_created_idx').on(t.createdAt)],
)

/** 消费幂等表:(event_id, consumer) 唯一,重复消费直接跳过 */
export const processedEvents = pgTable(
  'processed_events',
  {
    eventId: text('event_id').notNull(),
    consumer: text('consumer').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.consumer] })],
)

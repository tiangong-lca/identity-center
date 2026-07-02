/**
 * 后台任务 Worker(BullMQ 调度接线;任务逻辑均为 server/jobs 纯函数):
 *   pnpm worker
 * 事件消费(RabbitMQ)与定时任务(BullMQ repeatable)在此统一启动。
 */
import { Queue, Worker } from 'bullmq'
import IORedis from 'ioredis'
import 'dotenv/config'
import { createDbClient } from '@/lib/db/client'
import { getKeycloakAdmin } from '@/lib/keycloak/admin-client'
import { createRabbitMqAdapter } from '@/lib/mq/rabbitmq-adapter'
import { ALL_EVENT_TOPICS } from '@/lib/sync/event-types'
import { dispatchOutboxEvents } from '@/server/jobs/dispatch-outbox-events'
import { deliverDueWebhooks, enqueueWebhookDeliveries } from '@/server/jobs/deliver-webhooks'
import { projectKeycloakAssignments } from '@/server/jobs/project-assignments'
import { reconcileApplicationProjections, reconcileKeycloakUsers } from '@/server/jobs/reconcile'
import { retryDeadLetterEvents } from '@/server/jobs/retry-dead-letters'
import type { JobContext } from '@/server/jobs/types'

const QUEUE = 'identity-jobs'

const SCHEDULES: Array<{ name: string; everyMs: number }> = [
  { name: 'dispatch-outbox-events', everyMs: Number(process.env.JOB_DISPATCH_INTERVAL_MS ?? 5_000) },
  { name: 'deliver-webhooks', everyMs: Number(process.env.JOB_WEBHOOK_INTERVAL_MS ?? 10_000) },
  { name: 'project-keycloak-assignments', everyMs: Number(process.env.JOB_PROJECT_INTERVAL_MS ?? 60_000) },
  { name: 'retry-dead-letter-events', everyMs: Number(process.env.JOB_DLQ_INTERVAL_MS ?? 300_000) },
  { name: 'reconcile-keycloak-users', everyMs: Number(process.env.JOB_RECONCILE_USERS_MS ?? 3_600_000) },
  { name: 'reconcile-application-projections', everyMs: Number(process.env.JOB_RECONCILE_PROJ_MS ?? 3_600_000) },
]

async function main() {
  const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  })
  const dbClient = createDbClient(process.env.DATABASE_URL ?? '')
  const mq = createRabbitMqAdapter(process.env.RABBITMQ_URL ?? 'amqp://identity:identity@localhost:5672')
  const ctx: JobContext = { db: dbClient.db, mq, keycloak: getKeycloakAdmin() }

  // 1) MQ 事件消费:webhook 扇出(sync-application-assignments 的事件驱动触发也在此)
  const stopConsumer = await mq.consume(
    'identity.webhook-fanout',
    [...ALL_EVENT_TOPICS],
    async (message) => {
      await enqueueWebhookDeliveries(ctx, message)
    },
    { consumer: 'webhook-fanout' },
  )

  // 2) BullMQ 定时任务
  const queue = new Queue(QUEUE, { connection })
  for (const s of SCHEDULES) {
    await queue.upsertJobScheduler(s.name, { every: s.everyMs }, { name: s.name })
  }

  const handlers: Record<string, (ctx: JobContext) => Promise<unknown>> = {
    'dispatch-outbox-events': dispatchOutboxEvents,
    'deliver-webhooks': deliverDueWebhooks,
    'project-keycloak-assignments': projectKeycloakAssignments,
    'retry-dead-letter-events': retryDeadLetterEvents,
    'reconcile-keycloak-users': reconcileKeycloakUsers,
    'reconcile-application-projections': reconcileApplicationProjections,
  }

  const worker = new Worker(
    QUEUE,
    async (job) => {
      const handler = handlers[job.name]
      if (!handler) throw new Error(`未知任务 ${job.name}`)
      const result = await handler(ctx)
      return result
    },
    { connection, concurrency: 4 },
  )
  worker.on('failed', (job, err) => console.error(`[worker] ${job?.name} 失败:`, err.message))
  worker.on('completed', (job, result) => {
    const r = result as { processed?: number; failed?: number } | undefined
    if ((r?.processed ?? 0) > 0 || (r?.failed ?? 0) > 0) {
      console.log(`[worker] ${job.name}: processed=${r?.processed} failed=${r?.failed}`)
    }
  })

  console.log(`worker 启动:队列 ${QUEUE},事件消费 identity.webhook-fanout`)

  const shutdown = async () => {
    console.log('worker 优雅退出中...')
    await worker.close()
    await queue.close()
    await stopConsumer()
    await mq.close()
    await dbClient.close()
    await connection.quit()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

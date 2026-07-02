import { eq, inArray } from 'drizzle-orm'
import * as schema from '@/db/schema'
import type { JobContext, JobResult } from './types'

type Assignment = typeof schema.applicationAssignments.$inferSelect

/** 单条准入投影(active→授予,revoked/expired→移除);供重投影任务与事件消费共用 */
export async function projectAssignment(ctx: JobContext, assignment: Assignment): Promise<void> {
  const app = await ctx.db.query.applications.findFirst({
    where: eq(schema.applications.id, assignment.applicationId),
  })
  if (!app) throw new Error(`应用 ${assignment.applicationId} 不存在`)
  const user = await ctx.db.query.portalUsers.findFirst({
    where: eq(schema.portalUsers.id, assignment.portalUserId),
  })
  if (!user) throw new Error(`用户 ${assignment.portalUserId} 不存在`)

  const kcClient = await ctx.keycloak.findClientByClientId(app.keycloakClientId)
  if (!kcClient?.id) throw new Error(`Keycloak client ${app.keycloakClientId} 不存在`)
  const kcUserId = user.keycloakUserId ?? user.keycloakSub

  if (assignment.status === 'active') {
    await ctx.keycloak.grantClientRole(kcUserId, kcClient.id, app.accessClientRole)
  } else {
    await ctx.keycloak.revokeClientRole(kcUserId, kcClient.id, app.accessClientRole)
  }
}

/**
 * Keycloak 投影重试任务:扫 projection_status ∈ {pending, failed} 的准入,
 * 重放投影;成功→projected,失败→failed(保留错误供告警)。
 */
export async function projectKeycloakAssignments(ctx: JobContext): Promise<JobResult> {
  const rows = await ctx.db.query.applicationAssignments.findMany({
    where: inArray(schema.applicationAssignments.projectionStatus, ['pending', 'failed']),
    limit: 200,
  })
  let processed = 0
  let failed = 0
  for (const row of rows) {
    try {
      await projectAssignment(ctx, row)
      await ctx.db
        .update(schema.applicationAssignments)
        .set({ projectionStatus: 'projected', projectedAt: new Date(), lastProjectionError: null })
        .where(eq(schema.applicationAssignments.id, row.id))
      processed++
    } catch (error) {
      failed++
      await ctx.db
        .update(schema.applicationAssignments)
        .set({
          projectionStatus: 'failed',
          lastProjectionError: error instanceof Error ? error.message : String(error),
        })
        .where(eq(schema.applicationAssignments.id, row.id))
    }
  }
  return { processed, failed }
}

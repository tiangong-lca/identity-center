import { eq, inArray } from 'drizzle-orm'
import * as schema from '@/db/schema'
import type { JobContext, JobResult } from './types'
import { projectAssignment } from './project-assignments'

/**
 * 用户状态对账(高风险,每小时):以平台事实为准修 Keycloak enabled;
 * KC 缺用户 → sync_status=failed 并告警日志(人工介入)。
 */
export async function reconcileKeycloakUsers(ctx: JobContext): Promise<JobResult> {
  const users = await ctx.db.query.portalUsers.findMany({
    where: inArray(schema.portalUsers.status, ['active', 'disabled']),
    limit: 500,
  })
  let processed = 0
  let failed = 0
  let drift = 0
  for (const user of users) {
    if (!user.keycloakUserId) continue
    try {
      const kcUser = await ctx.keycloak.getUser(user.keycloakUserId)
      if (!kcUser) {
        failed++
        await ctx.db
          .update(schema.portalUsers)
          .set({ syncStatus: 'failed', updatedAt: new Date() })
          .where(eq(schema.portalUsers.id, user.id))
        console.error(`[reconcile] KC 缺用户 ${user.email}(${user.keycloakUserId}),需人工处理`)
        continue
      }
      const expectedEnabled = user.status === 'active'
      if (kcUser.enabled !== expectedEnabled) {
        drift++
        await ctx.keycloak.setUserEnabled(user.keycloakUserId, expectedEnabled)
        console.warn(`[reconcile] 修复用户状态漂移 ${user.email}: KC enabled=${kcUser.enabled} → ${expectedEnabled}`)
      }
      if (user.syncStatus !== 'in_sync') {
        await ctx.db
          .update(schema.portalUsers)
          .set({ syncStatus: 'in_sync', updatedAt: new Date() })
          .where(eq(schema.portalUsers.id, user.id))
      }
      processed++
    } catch (error) {
      failed++
      console.error(`[reconcile] 用户 ${user.email} 对账失败:`, error)
    }
  }
  return { processed, failed, details: { drift } }
}

/**
 * 准入投影对账(高风险,每小时):对比平台事实与 KC Client Role 实际,
 * 以平台为准补齐/移除(active 应有、revoked/expired 应无)。
 */
export async function reconcileApplicationProjections(ctx: JobContext): Promise<JobResult> {
  const apps = await ctx.db.query.applications.findMany({
    where: eq(schema.applications.status, 'active'),
  })
  let processed = 0
  let failed = 0
  let drift = 0

  for (const app of apps) {
    const kcClient = await ctx.keycloak.findClientByClientId(app.keycloakClientId)
    if (!kcClient?.id) {
      console.error(`[reconcile] 应用 ${app.code} 的 KC client 缺失`)
      failed++
      continue
    }
    const assignments = await ctx.db.query.applicationAssignments.findMany({
      where: eq(schema.applicationAssignments.applicationId, app.id),
    })
    for (const assignment of assignments) {
      const user = await ctx.db.query.portalUsers.findFirst({
        where: eq(schema.portalUsers.id, assignment.portalUserId),
      })
      if (!user?.keycloakUserId) continue
      try {
        const roles = await ctx.keycloak.listUserClientRoles(user.keycloakUserId, kcClient.id)
        const has = roles.some((r) => r.name === app.accessClientRole)
        const shouldHave = assignment.status === 'active'
        if (has !== shouldHave) {
          drift++
          await projectAssignment(ctx, assignment)
          await ctx.db
            .update(schema.applicationAssignments)
            .set({ projectionStatus: 'projected', projectedAt: new Date(), lastProjectionError: null })
            .where(eq(schema.applicationAssignments.id, assignment.id))
          console.warn(
            `[reconcile] 修复准入漂移 app=${app.code} user=${user.email} 应有=${shouldHave} 实际=${has}`,
          )
        }
        processed++
      } catch (error) {
        failed++
        console.error(`[reconcile] 准入对账失败 app=${app.code}:`, error)
      }
    }
  }
  return { processed, failed, details: { drift } }
}

import { and, count, eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import type { ServiceContext, ServiceDb } from './context'

export type ReconcileApp = {
  code: string
  keycloakClientId: string
  accessClientRole: string
}

export type ReconcileReport = {
  ensured: string[]
  clientMissing: string[]
  errors: Array<{ appCode: string; message: string }>
}

export type PendingDeactivateItem = {
  kind: 'app' | 'role'
  appCode: string
  roleCode?: string
  name: string
  affectedAssignments: number
}
export type DriftReport = { pendingDeactivate: PendingDeactivateItem[] }

/** 统计目标当前 active 的受影响 assignment 数(app 级 applicationAssignments / role 级 applicationUserRoles) */
export async function countActiveAssignments(
  db: ServiceDb,
  target: { appId: string } | { roleId: string },
): Promise<number> {
  if ('appId' in target) {
    const [r] = await db
      .select({ value: count() })
      .from(schema.applicationAssignments)
      .where(and(eq(schema.applicationAssignments.applicationId, target.appId), eq(schema.applicationAssignments.status, 'active')))
    return r?.value ?? 0
  }
  const [r] = await db
    .select({ value: count() })
    .from(schema.applicationUserRoles)
    .where(and(eq(schema.applicationUserRoles.applicationRoleId, target.roleId), eq(schema.applicationUserRoles.status, 'active')))
  return r?.value ?? 0
}

/** active 应用 → ReconcileApp[](周期 job 的 ensure 输入源) */
export async function loadActiveReconcileApps(db: ServiceDb): Promise<ReconcileApp[]> {
  const apps = await db.query.applications.findMany({ where: eq(schema.applications.status, 'active') })
  return apps.map((a) => ({ code: a.code, keycloakClientId: a.keycloakClientId, accessClientRole: a.accessClientRole }))
}

/**
 * 目录 reconcile 控制器:期望态(表)→ KC 实际态。
 * 只在**已有** client 上 ensure 准入 accessRole(client role);不建 client、不为业务角色建 KC 角色。
 * 逐 app 隔离:单 app 失败/缺 client 不阻断其它。
 */
export function createCatalogReconcileService(ctx: ServiceContext) {
  return {
    async ensureKeycloakRoles(apps: ReconcileApp[]): Promise<ReconcileReport> {
      const report: ReconcileReport = { ensured: [], clientMissing: [], errors: [] }
      for (const app of apps) {
        try {
          const client = await ctx.keycloak.findClientByClientId(app.keycloakClientId)
          if (!client?.id) {
            report.clientMissing.push(app.code)
            continue
          }
          await ctx.keycloak.ensureClientRole(client.id, app.accessClientRole)
          report.ensured.push(`${app.keycloakClientId}/${app.accessClientRole}`)
        } catch (e) {
          report.errors.push({ appCode: app.code, message: e instanceof Error ? e.message : String(e) })
        }
      }
      return report
    },

    async detectDrift(): Promise<DriftReport> {
      const [pendingApps, pendingRoles, allApps] = await Promise.all([
        ctx.db.query.applications.findMany({ where: eq(schema.applications.status, 'pending_deactivate') }),
        ctx.db.query.applicationRoles.findMany({ where: eq(schema.applicationRoles.status, 'pending_deactivate') }),
        ctx.db.query.applications.findMany(),
      ])
      const codeById = new Map(allApps.map((a) => [a.id, a.code]))
      const items: PendingDeactivateItem[] = []
      for (const a of pendingApps) {
        items.push({ kind: 'app', appCode: a.code, name: a.name, affectedAssignments: await countActiveAssignments(ctx.db, { appId: a.id }) })
      }
      for (const r of pendingRoles) {
        items.push({ kind: 'role', appCode: codeById.get(r.applicationId) ?? '', roleCode: r.code, name: r.name, affectedAssignments: await countActiveAssignments(ctx.db, { roleId: r.id }) })
      }
      return { pendingDeactivate: items }
    },
  }
}

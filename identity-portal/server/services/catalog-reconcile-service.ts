import type { ServiceContext } from './context'

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
  }
}

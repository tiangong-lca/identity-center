// server/jobs/reconcile-catalog.ts —— 周期把 KC 实际态对齐到 active 应用,并汇报 pending_deactivate backlog。
// 与 reconcile.ts 同构;不自动确认停用(纯人工)。
import type { JobContext, JobResult } from './types'
import { createCatalogReconcileService, loadActiveReconcileApps } from '@/server/services/catalog-reconcile-service'

export async function reconcileCatalog(ctx: JobContext): Promise<JobResult> {
  const svc = createCatalogReconcileService({ db: ctx.db, keycloak: ctx.keycloak })
  const apps = await loadActiveReconcileApps(ctx.db)
  const ensured = await svc.ensureKeycloakRoles(apps)
  const drift = await svc.detectDrift()
  if (ensured.clientMissing.length) console.error(`[reconcile-catalog] KC 缺 client: ${ensured.clientMissing.join(', ')}`)
  for (const e of ensured.errors) console.error(`[reconcile-catalog] ensure 失败 ${e.appCode}: ${e.message}`)
  if (drift.pendingDeactivate.length) console.warn(`[reconcile-catalog] 待确认停用 ${drift.pendingDeactivate.length} 项`)
  return {
    processed: ensured.ensured.length,
    failed: ensured.clientMissing.length + ensured.errors.length,
    details: { ensured: ensured.ensured, clientMissing: ensured.clientMissing, errors: ensured.errors, pendingDeactivate: drift.pendingDeactivate },
  }
}

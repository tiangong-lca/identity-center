import { adminRoute, ok } from '@/app/api/_helpers'
import { createCatalogReconcileService } from '@/server/services/catalog-reconcile-service'

export const GET = adminRoute({ permission: 'catalog:read' }, async (_request, { requestId, ctx }) => {
  const { pendingDeactivate } = await createCatalogReconcileService(ctx).detectDrift()
  return ok({ items: pendingDeactivate }, requestId)
})

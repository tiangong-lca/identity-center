import { adminRoute, ok } from '@/app/api/_helpers'
import { createCatalogService } from '@/server/services/catalog-service'

export const GET = adminRoute({ permission: 'catalog:read' }, async (_request, { requestId, ctx }) => {
  return ok(await createCatalogService(ctx).getCurrent(), requestId)
})

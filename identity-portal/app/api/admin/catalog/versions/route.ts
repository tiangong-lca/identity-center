import { adminRoute, ok } from '@/app/api/_helpers'
import { createCatalogService } from '@/server/services/catalog-service'

export const GET = adminRoute({ permission: 'catalog:read' }, async (_request, { requestId, ctx }) => {
  const items = await createCatalogService(ctx).listVersions()
  return ok({ items }, requestId)
})

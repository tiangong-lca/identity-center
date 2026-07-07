import { z } from 'zod'
import { adminRoute, ok, parseBody } from '@/app/api/_helpers'
import { createCatalogService } from '@/server/services/catalog-service'

const deactivateSchema = z.object({ appCode: z.string().min(1), roleCode: z.string().min(1).optional() })

export const POST = adminRoute({ permission: 'catalog:apply' }, async (request, { requestId, ctx }) => {
  const body = await parseBody(request, deactivateSchema)
  const result = await createCatalogService(ctx).confirmDeactivate(body)
  return ok(result, requestId)
})

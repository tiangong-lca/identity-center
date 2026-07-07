import { z } from 'zod'
import { adminRoute, ok, parseBody } from '@/app/api/_helpers'
import { createCatalogService } from '@/server/services/catalog-service'

const applySchema = z.object({ yaml: z.string(), expectedVersion: z.number().int().optional() })

export const POST = adminRoute({ permission: 'catalog:apply' }, async (request, { requestId, ctx }) => {
  const body = await parseBody(request, applySchema)
  const result = await createCatalogService(ctx).apply({
    yaml: body.yaml,
    expectedVersion: body.expectedVersion,
    source: 'console',
  })
  return ok(result, requestId)
})

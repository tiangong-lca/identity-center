import { z } from 'zod'
import { adminRoute, ok, parseBody } from '@/app/api/_helpers'
import { createCatalogService } from '@/server/services/catalog-service'

const rollbackSchema = z.object({ version: z.number().int(), expectedVersion: z.number().int().optional() })

export const POST = adminRoute({ permission: 'catalog:apply' }, async (request, { requestId, ctx }) => {
  const body = await parseBody(request, rollbackSchema)
  const result = await createCatalogService(ctx).rollback({ version: body.version, expectedVersion: body.expectedVersion })
  return ok(result, requestId)
})

import { adminRoute, ApiError, ok } from '@/app/api/_helpers'
import { createCatalogService } from '@/server/services/catalog-service'

export const GET = adminRoute({ permission: 'catalog:read' }, async (_request, { requestId, ctx, params }) => {
  const version = Number(params.version)
  if (!Number.isInteger(version)) throw new ApiError('VALIDATION_ERROR', 'version 必须是整数')
  const row = await createCatalogService(ctx).getVersion(version)
  if (!row) throw new ApiError('NOT_FOUND', `目录版本 ${version} 不存在`)
  return ok(row, requestId)
})

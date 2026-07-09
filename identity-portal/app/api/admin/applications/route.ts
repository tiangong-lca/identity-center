import { adminRoute, ApiError, ok, parseListQuery } from '@/app/api/_helpers'
import { createApplicationService } from '@/server/services/application-service'

export const GET = adminRoute({ permission: 'app:read' }, async (request, { requestId, ctx }) => {
  const q = parseListQuery(request)
  const result = await createApplicationService(ctx).list(q)
  return ok(result, requestId)
})

export const POST = adminRoute({ permission: 'app:create' }, async () => {
  throw new ApiError('CATALOG_MANAGED', '应用/角色定义由应用注册表管理,请用应用注册表 /admin/apps/registry')
})

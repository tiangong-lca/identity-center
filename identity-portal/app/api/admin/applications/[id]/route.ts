import { adminRoute, ApiError, ok } from '@/app/api/_helpers'
import { createApplicationService } from '@/server/services/application-service'

export const GET = adminRoute(
  { permission: 'app:read', scope: (p) => ({ type: 'app', id: p.id }) },
  async (_request, { requestId, ctx, params }) => {
    const app = await createApplicationService(ctx).get(params.id)
    if (!app) throw new ApiError('APPLICATION_NOT_FOUND', '应用不存在')
    return ok(app, requestId)
  },
)

export const PATCH = adminRoute(
  { permission: 'app:update', scope: (p) => ({ type: 'app', id: p.id }) },
  async () => {
    throw new ApiError('CATALOG_MANAGED', '应用/角色定义由应用注册表管理,请用应用注册表 /admin/apps/registry')
  },
)

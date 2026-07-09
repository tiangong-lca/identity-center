import { adminRoute, ApiError, ok } from '@/app/api/_helpers'
import { createApplicationService } from '@/server/services/application-service'

export const GET = adminRoute(
  { permission: 'role:read', scope: (p) => ({ type: 'app', id: p.id }) },
  async (_request, { requestId, ctx, params }) => {
    const roles = await createApplicationService(ctx).listRoles(params.id)
    return ok({ items: roles }, requestId)
  },
)

export const POST = adminRoute(
  { permission: 'role:manage', scope: (p) => ({ type: 'app', id: p.id }) },
  async () => {
    throw new ApiError('CATALOG_MANAGED', '应用/角色定义由应用注册表管理,请用应用注册表 /admin/apps/registry')
  },
)

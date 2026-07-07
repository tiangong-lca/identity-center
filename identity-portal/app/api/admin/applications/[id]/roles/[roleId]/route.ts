import { adminRoute, ApiError } from '@/app/api/_helpers'

export const PATCH = adminRoute(
  { permission: 'role:manage', scope: (p) => ({ type: 'app', id: p.id }) },
  async () => {
    throw new ApiError('CATALOG_MANAGED', '应用/角色定义由应用注册表管理,请用应用注册表 /admin/apps/registry')
  },
)

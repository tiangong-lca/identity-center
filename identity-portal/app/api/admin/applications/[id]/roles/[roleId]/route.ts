import { adminRoute, ApiError } from '@/app/api/_helpers'

export const PATCH = adminRoute(
  { permission: 'role:manage', scope: (p) => ({ type: 'app', id: p.id }) },
  async () => {
    throw new ApiError('CATALOG_MANAGED', '应用/角色定义由目录管理,请用目录编辑器 /admin/catalog')
  },
)

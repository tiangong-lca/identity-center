import { adminRoute, ok } from '@/app/api/_helpers'
import { createAdminRbacService } from '@/server/services/admin-rbac-service'

export const GET = adminRoute({ permission: 'admin-role:read' }, async (_request, { requestId, ctx }) => {
  const items = await createAdminRbacService(ctx).listPermissions()
  return ok({ items }, requestId)
})

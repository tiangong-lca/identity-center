import { adminRoute, ok } from '@/app/api/_helpers'
import { createAdminRbacService } from '@/server/services/admin-rbac-service'

export const DELETE = adminRoute({ permission: 'admin-role:manage' }, async (_request, { requestId, ctx, params }) => {
  await createAdminRbacService(ctx).revokePermission(params.id, params.permissionId)
  return ok({ revoked: true }, requestId)
})

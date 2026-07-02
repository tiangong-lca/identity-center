import { z } from 'zod'
import { adminRoute, ok, parseBody } from '@/app/api/_helpers'
import { createAdminRbacService } from '@/server/services/admin-rbac-service'

export const GET = adminRoute({ permission: 'admin-role:read' }, async (_request, { requestId, ctx, params }) => {
  const items = await createAdminRbacService(ctx).listRolePermissions(params.id)
  return ok({ items }, requestId)
})

const grantSchema = z.object({ adminPermissionId: z.uuid() })

export const POST = adminRoute({ permission: 'admin-role:manage' }, async (request, { requestId, ctx, params }) => {
  const body = await parseBody(request, grantSchema)
  await createAdminRbacService(ctx).grantPermission(params.id, body.adminPermissionId)
  return ok({ granted: true }, requestId, 201)
})

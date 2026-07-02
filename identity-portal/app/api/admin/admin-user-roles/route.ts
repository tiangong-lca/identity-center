import { z } from 'zod'
import { adminRoute, ok, parseBody } from '@/app/api/_helpers'
import { createAdminRbacService } from '@/server/services/admin-rbac-service'

const bindSchema = z.object({
  portalUserId: z.uuid(),
  adminRoleId: z.uuid(),
  scopeType: z.enum(['global', 'org', 'app']).optional(),
  scopeId: z.string().max(100).optional(),
})

export const POST = adminRoute({ permission: 'admin-role:manage' }, async (request, { requestId, ctx }) => {
  const body = await parseBody(request, bindSchema)
  const row = await createAdminRbacService(ctx).bindUser(body.portalUserId, body.adminRoleId, {
    type: body.scopeType ?? 'global',
    id: body.scopeId,
  })
  return ok(row, requestId, 201)
})

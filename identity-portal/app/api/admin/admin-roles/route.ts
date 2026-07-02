import { z } from 'zod'
import { adminRoute, ok, parseBody } from '@/app/api/_helpers'
import { createAdminRbacService } from '@/server/services/admin-rbac-service'

export const GET = adminRoute({ permission: 'admin-role:read' }, async (_request, { requestId, ctx }) => {
  const items = await createAdminRbacService(ctx).listRoles()
  return ok({ items }, requestId)
})

const createSchema = z.object({
  code: z.string().min(2).max(50).regex(/^[a-z0-9_]+$/),
  name: z.string().min(1).max(100),
  description: z.string().max(300).optional(),
})

export const POST = adminRoute({ permission: 'admin-role:manage' }, async (request, { requestId, ctx }) => {
  const body = await parseBody(request, createSchema)
  const role = await createAdminRbacService(ctx).createRole(body)
  return ok(role, requestId, 201)
})

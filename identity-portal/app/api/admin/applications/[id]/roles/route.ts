import { z } from 'zod'
import { adminRoute, ok, parseBody } from '@/app/api/_helpers'
import { createApplicationService } from '@/server/services/application-service'

export const GET = adminRoute(
  { permission: 'role:read', scope: (p) => ({ type: 'app', id: p.id }) },
  async (_request, { requestId, ctx, params }) => {
    const roles = await createApplicationService(ctx).listRoles(params.id)
    return ok({ items: roles }, requestId)
  },
)

const createRoleSchema = z.object({
  code: z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1).max(100),
  description: z.string().max(300).optional(),
})

export const POST = adminRoute(
  { permission: 'role:manage', scope: (p) => ({ type: 'app', id: p.id }) },
  async (request, { requestId, ctx, params }) => {
    const body = await parseBody(request, createRoleSchema)
    const role = await createApplicationService(ctx).createRole(params.id, body)
    return ok(role, requestId, 201)
  },
)

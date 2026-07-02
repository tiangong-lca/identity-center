import { z } from 'zod'
import { adminRoute, ok, parseBody } from '@/app/api/_helpers'
import { createApplicationService } from '@/server/services/application-service'

const updateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(300).optional(),
  status: z.enum(['active', 'disabled']).optional(),
})

export const PATCH = adminRoute(
  { permission: 'role:manage', scope: (p) => ({ type: 'app', id: p.id }) },
  async (request, { requestId, ctx, params }) => {
    const body = await parseBody(request, updateRoleSchema)
    const role = await createApplicationService(ctx).updateRole(params.roleId, body)
    return ok(role, requestId)
  },
)

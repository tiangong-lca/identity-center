import { z } from 'zod'
import { adminRoute, ok, parseBody } from '@/app/api/_helpers'
import { createAppRoleAssignmentService } from '@/server/services/app-role-assignment-service'

export const GET = adminRoute(
  { permission: 'role:read', scope: (p) => ({ type: 'app', id: p.id }) },
  async (_request, { requestId, ctx, params }) => {
    const items = await createAppRoleAssignmentService(ctx).listByApplication(params.id)
    return ok({ items }, requestId)
  },
)

const assignSchema = z.object({
  applicationRoleId: z.uuid(),
  portalUserId: z.uuid(),
  scopeType: z.enum(['global', 'tenant', 'org', 'team', 'project']).optional(),
  scopeId: z.string().max(100).optional(),
})

export const POST = adminRoute(
  { permission: 'app:assign', scope: (p) => ({ type: 'app', id: p.id }) },
  async (request, { requestId, ctx, params }) => {
    const body = await parseBody(request, assignSchema)
    const row = await createAppRoleAssignmentService(ctx).assign({
      applicationId: params.id,
      ...body,
    })
    return ok(row, requestId, 201)
  },
)

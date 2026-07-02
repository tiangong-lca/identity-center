import { z } from 'zod'
import { adminRoute, ok, parseBody } from '@/app/api/_helpers'
import { createOrganizationService } from '@/server/services/organization-service'

export const GET = adminRoute(
  { permission: 'org:read', scope: (p) => ({ type: 'org', id: p.id }) },
  async (_request, { requestId, ctx, params }) => {
    const items = await createOrganizationService(ctx).listMembers(params.id)
    return ok({ items }, requestId)
  },
)

const addSchema = z.object({
  portalUserId: z.uuid(),
  memberType: z.enum(['member', 'manager', 'owner']).optional(),
})

export const POST = adminRoute(
  { permission: 'org:manage', scope: (p) => ({ type: 'org', id: p.id }) },
  async (request, { requestId, ctx, params }) => {
    const body = await parseBody(request, addSchema)
    const row = await createOrganizationService(ctx).addMember(
      params.id,
      body.portalUserId,
      body.memberType,
    )
    return ok(row, requestId, 201)
  },
)

import { z } from 'zod'
import { adminRoute, ApiError, ok, parseBody } from '@/app/api/_helpers'
import { createOrganizationService } from '@/server/services/organization-service'

export const GET = adminRoute(
  { permission: 'org:read', scope: (p) => ({ type: 'org', id: p.id }) },
  async (_request, { requestId, ctx, params }) => {
    const org = await createOrganizationService(ctx).get(params.id)
    if (!org) throw new ApiError('NOT_FOUND', '组织不存在')
    return ok(org, requestId)
  },
)

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  type: z.enum(['company', 'department', 'business_unit', 'team']).optional(),
})

export const PATCH = adminRoute(
  { permission: 'org:manage', scope: (p) => ({ type: 'org', id: p.id }) },
  async (request, { requestId, ctx, params }) => {
    const body = await parseBody(request, updateSchema)
    const org = await createOrganizationService(ctx).update(params.id, body)
    return ok(org, requestId)
  },
)

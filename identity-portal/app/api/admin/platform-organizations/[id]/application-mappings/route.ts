import { z } from 'zod'
import { adminRoute, ok, parseBody } from '@/app/api/_helpers'
import { createOrganizationService } from '@/server/services/organization-service'

export const GET = adminRoute(
  { permission: 'org:read', scope: (p) => ({ type: 'org', id: p.id }) },
  async (_request, { requestId, ctx, params }) => {
    const items = await createOrganizationService(ctx).listMappings(params.id)
    return ok({ items }, requestId)
  },
)

const setSchema = z.object({
  applicationId: z.uuid(),
  businessAppOrgId: z.string().min(1).max(200),
})

export const POST = adminRoute(
  { permission: 'org:manage', scope: (p) => ({ type: 'org', id: p.id }) },
  async (request, { requestId, ctx, params }) => {
    const body = await parseBody(request, setSchema)
    const row = await createOrganizationService(ctx).setMapping(
      params.id,
      body.applicationId,
      body.businessAppOrgId,
    )
    return ok(row, requestId, 201)
  },
)

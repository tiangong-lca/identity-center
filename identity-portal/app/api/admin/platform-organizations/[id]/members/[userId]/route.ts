import { adminRoute, ok } from '@/app/api/_helpers'
import { createOrganizationService } from '@/server/services/organization-service'

export const DELETE = adminRoute(
  { permission: 'org:manage', scope: (p) => ({ type: 'org', id: p.id }) },
  async (_request, { requestId, ctx, params }) => {
    await createOrganizationService(ctx).removeMember(params.id, params.userId)
    return ok({ removed: true }, requestId)
  },
)

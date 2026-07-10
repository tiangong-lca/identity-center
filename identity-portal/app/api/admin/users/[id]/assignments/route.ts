import { adminRoute, ok } from '@/app/api/_helpers'
import { createAssignmentService } from '@/server/services/assignment-service'

export const GET = adminRoute(
  { permission: 'user:read' },
  async (_request, { requestId, ctx, params }) => {
    const items = await createAssignmentService(ctx).listByUser(params.id)
    return ok({ items }, requestId)
  },
)

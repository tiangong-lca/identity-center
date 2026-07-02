import { adminRoute, ok } from '@/app/api/_helpers'
import { createAppRoleAssignmentService } from '@/server/services/app-role-assignment-service'

export const DELETE = adminRoute(
  { permission: 'app:revoke', scope: (p) => ({ type: 'app', id: p.id }) },
  async (_request, { requestId, ctx, params }) => {
    const row = await createAppRoleAssignmentService(ctx).revoke(params.assignmentId)
    return ok(row, requestId)
  },
)

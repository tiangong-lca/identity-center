import { adminRoute, ok } from '@/app/api/_helpers'
import { createUserService } from '@/server/services/user-service'

export const POST = adminRoute({ permission: 'user:reset-mfa' }, async (_request, { requestId, ctx, params }) => {
  await createUserService(ctx).resetMfa(params.id)
  return ok({ reset: true }, requestId)
})

import { adminRoute, ok } from '@/app/api/_helpers'
import { createUserService } from '@/server/services/user-service'

export const POST = adminRoute({ permission: 'user:enable' }, async (_request, { requestId, ctx, params }) => {
  const user = await createUserService(ctx).enable(params.id)
  return ok(user, requestId)
})

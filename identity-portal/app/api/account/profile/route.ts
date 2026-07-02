import { accountRoute } from '@/app/api/_helpers'
import { ApiError } from '@/lib/http/api-error'
import { ok } from '@/lib/http/response'
import { createUserService } from '@/server/services/user-service'

export const GET = accountRoute(async (_request, { requestId, ctx, keycloakSub }) => {
  const user = await createUserService(ctx).getByKeycloakSub(keycloakSub)
  if (!user) throw new ApiError('USER_NOT_FOUND', '当前用户尚未同步到平台')
  return ok(
    {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      createdAt: user.createdAt,
    },
    requestId,
  )
})

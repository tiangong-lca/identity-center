import { z } from 'zod'
import { adminRoute, ApiError, ok, parseBody } from '@/app/api/_helpers'
import { createUserService } from '@/server/services/user-service'

export const GET = adminRoute({ permission: 'user:read' }, async (_request, { requestId, ctx, params }) => {
  const user = await createUserService(ctx).get(params.id)
  if (!user) throw new ApiError('USER_NOT_FOUND', '用户不存在')
  return ok(user, requestId)
})

const updateSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
})

export const PATCH = adminRoute({ permission: 'user:update' }, async (request, { requestId, ctx, params }) => {
  const body = await parseBody(request, updateSchema)
  const user = await createUserService(ctx).update(params.id, body)
  return ok(user, requestId)
})

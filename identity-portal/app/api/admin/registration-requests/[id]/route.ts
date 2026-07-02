import { adminRoute, ApiError, ok } from '@/app/api/_helpers'
import { createRegistrationService } from '@/server/services/registration-service'

export const GET = adminRoute({ permission: 'registration:read' }, async (_request, { requestId, ctx, params }) => {
  const row = await createRegistrationService(ctx).get(params.id)
  if (!row) throw new ApiError('NOT_FOUND', '注册申请不存在')
  return ok(row, requestId)
})

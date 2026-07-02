import { adminRoute, ok, parseListQuery } from '@/app/api/_helpers'
import { createRegistrationService } from '@/server/services/registration-service'

export const GET = adminRoute({ permission: 'registration:read' }, async (request, { requestId, ctx }) => {
  const q = parseListQuery(request)
  const result = await createRegistrationService(ctx).list(q)
  return ok(result, requestId)
})

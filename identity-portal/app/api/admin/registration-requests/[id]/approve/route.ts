import { z } from 'zod'
import { adminRoute, ok, parseBody } from '@/app/api/_helpers'
import { createRegistrationService } from '@/server/services/registration-service'

const schema = z.object({
  reviewComment: z.string().max(500).optional(),
  temporaryPassword: z.string().min(10).optional(),
})

export const POST = adminRoute(
  { permission: 'registration:review' },
  async (request, { requestId, ctx, params }) => {
    const body = await parseBody(request, schema)
    const result = await createRegistrationService(ctx).approve(params.id, body)
    return ok(result, requestId)
  },
)

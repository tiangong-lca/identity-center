import { z } from 'zod'
import { adminRoute, ok, parseBody } from '@/app/api/_helpers'
import { createUserService } from '@/server/services/user-service'

const schema = z.object({ temporaryPassword: z.string().min(10) })

export const POST = adminRoute(
  { permission: 'user:reset-password' },
  async (request, { requestId, ctx, params }) => {
    const body = await parseBody(request, schema)
    await createUserService(ctx).resetPassword(params.id, body.temporaryPassword)
    return ok({ reset: true }, requestId)
  },
)

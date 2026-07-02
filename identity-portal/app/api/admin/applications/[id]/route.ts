import { z } from 'zod'
import { adminRoute, ApiError, ok, parseBody } from '@/app/api/_helpers'
import { createApplicationService } from '@/server/services/application-service'

export const GET = adminRoute(
  { permission: 'app:read', scope: (p) => ({ type: 'app', id: p.id }) },
  async (_request, { requestId, ctx, params }) => {
    const app = await createApplicationService(ctx).get(params.id)
    if (!app) throw new ApiError('APPLICATION_NOT_FOUND', '应用不存在')
    return ok(app, requestId)
  },
)

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  loginUrl: z.url().nullable().optional(),
  adminUrl: z.url().nullable().optional(),
  webhookUrl: z.url().nullable().optional(),
  webhookSecretRef: z.string().min(1).nullable().optional(),
})

export const PATCH = adminRoute(
  { permission: 'app:update', scope: (p) => ({ type: 'app', id: p.id }) },
  async (request, { requestId, ctx, params }) => {
    const body = await parseBody(request, updateSchema)
    const app = await createApplicationService(ctx).update(params.id, {
      name: body.name,
      status: body.status,
      loginUrl: body.loginUrl ?? undefined,
      adminUrl: body.adminUrl ?? undefined,
      webhookUrl: body.webhookUrl ?? undefined,
      webhookSecretRef: body.webhookSecretRef ?? undefined,
    })
    return ok(app, requestId)
  },
)

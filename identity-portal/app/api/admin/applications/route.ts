import { z } from 'zod'
import { adminRoute, ok, parseBody, parseListQuery } from '@/app/api/_helpers'
import { createApplicationService } from '@/server/services/application-service'

export const GET = adminRoute({ permission: 'app:read' }, async (request, { requestId, ctx }) => {
  const q = parseListQuery(request)
  const result = await createApplicationService(ctx).list(q)
  return ok(result, requestId)
})

const createSchema = z.object({
  code: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(100),
  keycloakClientId: z.string().min(1),
  accessClientRole: z.string().min(1).optional(),
  loginUrl: z.url().optional(),
  adminUrl: z.url().optional(),
  webhookUrl: z.url().optional(),
  webhookSecretRef: z.string().min(1).optional(),
})

export const POST = adminRoute({ permission: 'app:create' }, async (request, { requestId, ctx }) => {
  const body = await parseBody(request, createSchema)
  const app = await createApplicationService(ctx).create(body)
  return ok(app, requestId, 201)
})

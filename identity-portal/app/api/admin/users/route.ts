import { z } from 'zod'
import { adminRoute, ok, parseBody, parseListQuery } from '@/app/api/_helpers'
import { createUserService, type PortalUserStatus } from '@/server/services/user-service'

export const GET = adminRoute({ permission: 'user:read' }, async (request, { requestId, ctx }) => {
  const q = parseListQuery(request)
  const result = await createUserService(ctx).list({
    page: q.page,
    pageSize: q.pageSize,
    keyword: q.keyword,
    status: q.status as PortalUserStatus | undefined,
  })
  return ok(result, requestId)
})

const createUserSchema = z.object({
  email: z.email(),
  displayName: z.string().min(1).max(100).optional(),
  temporaryPassword: z.string().min(10),
})

export const POST = adminRoute({ permission: 'user:create' }, async (request, { requestId, ctx }) => {
  const body = await parseBody(request, createUserSchema)
  const user = await createUserService(ctx).create(body)
  return ok(user, requestId, 201)
})

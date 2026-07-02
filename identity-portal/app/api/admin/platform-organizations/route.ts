import { z } from 'zod'
import { adminRoute, ok, parseBody, parseListQuery } from '@/app/api/_helpers'
import { createOrganizationService } from '@/server/services/organization-service'

export const GET = adminRoute({ permission: 'org:read' }, async (request, { requestId, ctx }) => {
  const q = parseListQuery(request)
  const result = await createOrganizationService(ctx).list(q)
  return ok(result, requestId)
})

const createSchema = z.object({
  code: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(100),
  type: z.enum(['company', 'department', 'business_unit', 'team']).optional(),
  parentId: z.uuid().optional(),
})

export const POST = adminRoute({ permission: 'org:manage' }, async (request, { requestId, ctx }) => {
  const body = await parseBody(request, createSchema)
  const org = await createOrganizationService(ctx).create(body)
  return ok(org, requestId, 201)
})

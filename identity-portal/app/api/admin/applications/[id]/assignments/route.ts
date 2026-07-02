import { z } from 'zod'
import { adminRoute, ok, parseBody, parseListQuery } from '@/app/api/_helpers'
import { createAssignmentService } from '@/server/services/assignment-service'

export const GET = adminRoute(
  { permission: 'app:read', scope: (p) => ({ type: 'app', id: p.id }) },
  async (request, { requestId, ctx, params }) => {
    const q = parseListQuery(request)
    const result = await createAssignmentService(ctx).listByApplication(params.id, q)
    return ok(result, requestId)
  },
)

const grantSchema = z.object({ portalUserId: z.uuid() })

export const POST = adminRoute(
  { permission: 'app:assign', scope: (p) => ({ type: 'app', id: p.id }) },
  async (request, { requestId, ctx, params }) => {
    const body = await parseBody(request, grantSchema)
    const result = await createAssignmentService(ctx).grant(params.id, body.portalUserId)
    // 授予为最终一致:投影未完成返回 202 SYNC_PENDING 语义(data 附投影状态)
    return ok(result, requestId, result.projection === 'projected' ? 201 : 202)
  },
)

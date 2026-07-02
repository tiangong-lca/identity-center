import { adminRoute, ok } from '@/app/api/_helpers'
import { createAuditService } from '@/server/services/audit-service'

export const GET = adminRoute({ permission: 'audit:read' }, async (request, { requestId, ctx }) => {
  const sp = request.nextUrl.searchParams
  const result = await createAuditService(ctx).list({
    page: sp.get('page') ? Number(sp.get('page')) : undefined,
    pageSize: sp.get('pageSize') ? Number(sp.get('pageSize')) : undefined,
    action: sp.get('action') ?? undefined,
    actorKeycloakSub: sp.get('actor') ?? undefined,
    targetType: sp.get('targetType') ?? undefined,
    targetId: sp.get('targetId') ?? undefined,
  })
  return ok(result, requestId)
})

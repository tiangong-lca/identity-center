import { accountRoute } from '@/app/api/_helpers'
import { ok } from '@/lib/http/response'
import { createAssignmentService } from '@/server/services/assignment-service'
import { createUserService } from '@/server/services/user-service'

/** 当前用户可访问的应用列表(active 准入 join 应用目录) */
export const GET = accountRoute(async (_request, { requestId, ctx, keycloakSub }) => {
  const user = await createUserService(ctx).getByKeycloakSub(keycloakSub)
  if (!user) return ok({ items: [] }, requestId)
  const items = await createAssignmentService(ctx).listAccessibleApps(user.id)
  return ok({ items }, requestId)
})

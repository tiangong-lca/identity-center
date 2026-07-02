import { accountRoute } from '@/app/api/_helpers'
import { ok } from '@/lib/http/response'
import { createUserService } from '@/server/services/user-service'

/** 当前用户的 Keycloak 登录会话列表 */
export const GET = accountRoute(async (_request, { requestId, ctx, keycloakSub }) => {
  const user = await createUserService(ctx).getByKeycloakSub(keycloakSub)
  if (!user?.keycloakUserId) return ok({ items: [] }, requestId)
  const sessions = await ctx.keycloak.listUserSessions(user.keycloakUserId)
  const items = sessions.map((s) => ({
    id: s.id,
    ipAddress: s.ipAddress,
    start: s.start,
    lastAccess: s.lastAccess,
    clients: s.clients,
  }))
  return ok({ items }, requestId)
})

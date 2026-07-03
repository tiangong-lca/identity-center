import { ok, publicRoute } from '@/app/api/_helpers'
import { createApplicationService } from '@/server/services/application-service'

/** 注册页应用/角色选择目录(D7):仅 active;仅暴露 code/name(公开可枚举性已评审接受) */
export const GET = publicRoute({ scene: 'catalog' }, async (_request, { requestId, ctx }) => {
  const items = await createApplicationService(ctx).listCatalog()
  return ok({ items }, requestId)
})

import { and, eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { ok, publicRoute } from '@/app/api/_helpers'

/** 注册页应用/角色选择目录(D7):仅 active;仅暴露 code/name(公开可枚举性已评审接受) */
export const GET = publicRoute({ scene: 'catalog' }, async (_request, { requestId, ctx }) => {
  const apps = await ctx.db.query.applications.findMany({
    where: eq(schema.applications.status, 'active'),
  })
  const items = await Promise.all(
    apps.map(async (app) => {
      const roles = await ctx.db.query.applicationRoles.findMany({
        where: and(
          eq(schema.applicationRoles.applicationId, app.id),
          eq(schema.applicationRoles.status, 'active'),
        ),
      })
      return {
        code: app.code,
        name: app.name,
        roles: roles.map((r) => ({ code: r.code, name: r.name })),
      }
    }),
  )
  return ok({ items }, requestId)
})

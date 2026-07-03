import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/db/schema'

type Db = NodePgDatabase<typeof schema>

const APP = {
  code: 'tiangong-lca',
  name: 'TianGong LCA 平台',
  keycloakClientId: 'tiangong-lca-business-app',
  accessClientRole: 'tiangong_lca_access',
  status: 'active' as const,
}

/** 应用级角色目录(设计 §4.5:互斥单角色管理约定;member 为应用默认标准身份不登记) */
const APP_ROLES: Array<{ code: string; name: string; description: string }> = [
  { code: 'admin', name: '系统管理员', description: 'TianGong LCA 系统管理员' },
  { code: 'review-admin', name: '评审管理员', description: '评审流程管理员' },
  { code: 'review-member', name: '评审成员', description: '评审成员' },
]

/** 首个业务应用登记(幂等):TianGong LCA;存量 supabase 占位行原位更名 */
export async function seedBusinessApps(db: Db) {
  let app = await db.query.applications.findFirst({
    where: eq(schema.applications.code, APP.code),
  })
  if (!app) {
    const legacy = await db.query.applications.findFirst({
      where: eq(schema.applications.code, 'supabase'),
    })
    if (legacy) {
      ;[app] = await db
        .update(schema.applications)
        .set({
          ...APP,
          webhookUrl: process.env.TIANGONG_LCA_WEBHOOK_URL ?? legacy.webhookUrl,
          webhookSecretRef: 'TIANGONG_LCA_WEBHOOK_SECRET',
          loginUrl: process.env.TIANGONG_LCA_LOGIN_URL ?? legacy.loginUrl,
          metadata: { onboarding: 'phase-1', kind: 'supabase-self-host' },
          updatedAt: new Date(),
        })
        .where(eq(schema.applications.id, legacy.id))
        .returning()
    } else {
      ;[app] = await db
        .insert(schema.applications)
        .values({
          ...APP,
          webhookUrl: process.env.TIANGONG_LCA_WEBHOOK_URL ?? null,
          webhookSecretRef: 'TIANGONG_LCA_WEBHOOK_SECRET',
          loginUrl: process.env.TIANGONG_LCA_LOGIN_URL ?? null,
          metadata: { onboarding: 'phase-1', kind: 'supabase-self-host' },
        })
        .returning()
    }
  }

  const existing = await db.query.applicationRoles.findMany({
    where: eq(schema.applicationRoles.applicationId, app.id),
  })
  const missing = APP_ROLES.filter((role) => !existing.some((r) => r.code === role.code))
  if (missing.length > 0) {
    await db.insert(schema.applicationRoles).values(
      missing.map((role) => ({
        applicationId: app.id,
        code: role.code,
        name: role.name,
        description: role.description,
        status: 'active',
      })),
    )
  }
}

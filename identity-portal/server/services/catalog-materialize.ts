import type { PgTransaction } from 'drizzle-orm/pg-core'
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import type { CatalogApp } from '@/lib/catalog/schema'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CatalogTx = PgTransaction<any, typeof schema, any>

type AppRow = typeof schema.applications.$inferSelect
type RoleRow = typeof schema.applicationRoles.$inferSelect

/**
 * 目录物化(纯 DB):按 desired(YAML 解析后的应用/角色)upsert applications + application_roles,
 * 并将 YAML 中缺失的存量应用/角色标记 pending_deactivate。
 * 不做版本冲突检查、不写 catalog_versions、不触发 reconcile/audit —— 那些是 catalog-service.apply 的职责。
 * curAppRows/curRoleRows 为写入前的快照(调用方在同一事务内查得)。
 */
export async function materializeCatalog(
  tx: CatalogTx,
  desired: CatalogApp[],
  curAppRows: AppRow[],
  curRoleRows: RoleRow[],
): Promise<void> {
  for (const app of desired) {
    const existing = curAppRows.find((a) => a.code === app.code)
    const values = {
      code: app.code,
      name: app.name,
      status: app.status,
      keycloakClientId: app.keycloak.clientId,
      accessClientRole: app.keycloak.accessRole,
      webhookUrl: app.webhook?.url ?? null,
      webhookSecretRef: app.webhook?.secretRef ?? null,
      loginUrl: app.loginUrl ?? null,
      adminUrl: app.adminUrl ?? null,
    }
    let appId: string
    if (existing) {
      await tx.update(schema.applications).set({ ...values, updatedAt: new Date() }).where(eq(schema.applications.id, existing.id))
      appId = existing.id
    } else {
      const [row] = await tx.insert(schema.applications).values(values).returning()
      appId = row.id
    }
    const existingRoles = curRoleRows.filter((r) => r.applicationId === appId)
    const desiredCodes = new Set(app.roles.map((r) => r.code))
    for (const role of app.roles) {
      const er = existingRoles.find((r) => r.code === role.code)
      if (er) {
        await tx.update(schema.applicationRoles).set({ name: role.name, description: role.description ?? null, status: 'active', updatedAt: new Date() }).where(eq(schema.applicationRoles.id, er.id))
      } else {
        await tx.insert(schema.applicationRoles).values({ applicationId: appId, code: role.code, name: role.name, description: role.description ?? null, status: 'active' })
      }
    }
    for (const er of existingRoles) {
      if (!desiredCodes.has(er.code) && er.status !== 'pending_deactivate' && er.status !== 'deactivated') {
        await tx.update(schema.applicationRoles).set({ status: 'pending_deactivate', updatedAt: new Date() }).where(eq(schema.applicationRoles.id, er.id))
      }
    }
  }
  const desiredAppCodes = new Set(desired.map((a) => a.code))
  for (const a of curAppRows) {
    if (!desiredAppCodes.has(a.code) && a.status !== 'pending_deactivate' && a.status !== 'deactivated') {
      await tx.update(schema.applications).set({ status: 'pending_deactivate', updatedAt: new Date() }).where(eq(schema.applications.id, a.id))
    }
  }
}

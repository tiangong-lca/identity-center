import { desc, eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { getAuditContext } from '@/lib/audit/context'
import { computeCatalogDiff, hasChanges, type CatalogDiff } from '@/lib/catalog/diff'
import { parseCatalogYaml, renderCatalogYaml, toCatalogApps } from '@/lib/catalog/serialize'
import { ApiError } from '@/lib/http/api-error'
import { createAuditLogRepository } from '@/server/repositories/audit-log-repository'
import { createCatalogReconcileService, type ReconcileReport } from './catalog-reconcile-service'
import type { ServiceContext } from './context'

function actorOf() {
  const c = getAuditContext()
  return {
    actorKeycloakSub: c?.actor?.keycloakSub ?? 'system',
    actorEmail: c?.actor?.email,
    requestId: c?.requestId,
    traceId: c?.traceId,
    operationId: c?.operationId,
  }
}

export type ApplyInput = { yaml: string; expectedVersion?: number; source?: 'console' | 'cli' | 'import' }
export type ApplyResult = { version: number; diff: CatalogDiff; report: ReconcileReport }

export function createCatalogService(ctx: ServiceContext) {
  const audit = createAuditLogRepository(ctx.db)
  const reconcile = createCatalogReconcileService(ctx)

  async function currentVersion(runner: Pick<ServiceContext['db'], 'select'>): Promise<number> {
    const [latest] = await runner
      .select({ version: schema.catalogVersions.version })
      .from(schema.catalogVersions)
      .orderBy(desc(schema.catalogVersions.version))
      .limit(1)
    return latest?.version ?? 0
  }

  return {
    async getCurrent(): Promise<{ yaml: string; version: number }> {
      const apps = await ctx.db.query.applications.findMany()
      const roles = await ctx.db.query.applicationRoles.findMany()
      const version = await currentVersion(ctx.db)
      return { yaml: renderCatalogYaml(toCatalogApps(apps, roles)), version }
    },

    async apply(input: ApplyInput): Promise<ApplyResult> {
      const doc = parseCatalogYaml(input.yaml) // 语法/schema/业务(唯一性)校验;失败即抛
      const { version, diff } = await ctx.db.transaction(async (tx) => {
        const curVer = await currentVersion(tx)
        if (input.expectedVersion !== undefined && input.expectedVersion !== curVer) {
          throw new ApiError('CONFLICT', `目录版本冲突:期望 ${input.expectedVersion},当前 ${curVer}`)
        }
        const curAppRows = await tx.query.applications.findMany()
        const curRoleRows = await tx.query.applicationRoles.findMany()
        const diff = computeCatalogDiff(toCatalogApps(curAppRows, curRoleRows), doc.applications)
        if (!hasChanges(diff)) return { version: curVer, diff }

        for (const app of doc.applications) {
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
            if (!desiredCodes.has(er.code) && er.status !== 'pending_deactivate') {
              await tx.update(schema.applicationRoles).set({ status: 'pending_deactivate', updatedAt: new Date() }).where(eq(schema.applicationRoles.id, er.id))
            }
          }
        }
        const desiredAppCodes = new Set(doc.applications.map((a) => a.code))
        for (const a of curAppRows) {
          if (!desiredAppCodes.has(a.code) && a.status !== 'pending_deactivate') {
            await tx.update(schema.applications).set({ status: 'pending_deactivate', updatedAt: new Date() }).where(eq(schema.applications.id, a.id))
          }
        }
        const newVersion = curVer + 1
        await tx.insert(schema.catalogVersions).values({
          version: newVersion,
          yaml: input.yaml,
          diff,
          appliedBy: actorOf().actorKeycloakSub,
          source: input.source ?? 'cli',
        })
        return { version: newVersion, diff }
      })

      // reconcile(事务提交后;只对 active 应用 ensure 准入 accessRole)
      const report = await reconcile.ensureKeycloakRoles(
        doc.applications
          .filter((a) => a.status === 'active')
          .map((a) => ({ code: a.code, keycloakClientId: a.keycloak.clientId, accessClientRole: a.keycloak.accessRole })),
      )

      if (hasChanges(diff)) {
        await audit.append({
          ...actorOf(),
          action: 'catalog.apply',
          targetType: 'catalog',
          targetId: String(version),
          afterData: { version, diff },
          result: 'success',
        })
      }
      return { version, diff, report }
    },
  }
}

import { and, desc, eq, ne } from 'drizzle-orm'
import { ZodError } from 'zod'
import * as schema from '@/db/schema'
import { getAuditContext } from '@/lib/audit/context'
import { computeCatalogDiff, hasChanges, type CatalogDiff } from '@/lib/catalog/diff'
import { scanForPlaintextSecrets } from '@/lib/catalog/secret-scan'
import { parseCatalogYaml, renderCatalogYaml, toCatalogApps } from '@/lib/catalog/serialize'
import type { CatalogDoc } from '@/lib/catalog/schema'
import { ApiError } from '@/lib/http/api-error'
import { createAuditLogRepository } from '@/server/repositories/audit-log-repository'
import { materializeCatalog } from './catalog-materialize'
import { createCatalogReconcileService, countActiveAssignments, type ReconcileReport } from './catalog-reconcile-service'
import type { ServiceContext } from './context'

/** parseCatalogYaml 的语法/schema 错误 → ApiError('VALIDATION_ERROR')(YAMLException/ZodError 不应以 500 兜底透出) */
function parseCatalogYamlOrThrow(yaml: string): CatalogDoc {
  try {
    return parseCatalogYaml(yaml)
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ApiError('VALIDATION_ERROR', 'catalog YAML 校验失败', {
        issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      })
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new ApiError('VALIDATION_ERROR', `catalog YAML 解析失败: ${message}`)
  }
}

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
      const doc = parseCatalogYamlOrThrow(input.yaml) // 语法/schema/业务(唯一性)校验;失败 → ApiError('VALIDATION_ERROR')
      const secretFindings = scanForPlaintextSecrets(doc)
      if (secretFindings.length > 0) {
        throw new ApiError('VALIDATION_ERROR', 'catalog YAML 疑似含明文密钥(应改用 secretRef)', {
          issues: secretFindings.map((f) => ({ path: f.path, message: `疑似明文密钥(${f.hint})` })),
        })
      }
      const { version, diff } = await ctx.db.transaction(async (tx) => {
        const curVer = await currentVersion(tx)
        if (input.expectedVersion !== undefined && input.expectedVersion !== curVer) {
          throw new ApiError('CONFLICT', `目录版本冲突:期望 ${input.expectedVersion},当前 ${curVer}`)
        }
        const curAppRows = await tx.query.applications.findMany()
        const curRoleRows = await tx.query.applicationRoles.findMany()
        const diff = computeCatalogDiff(toCatalogApps(curAppRows, curRoleRows), doc.applications)
        if (!hasChanges(diff)) return { version: curVer, diff }

        await materializeCatalog(tx, doc.applications, curAppRows, curRoleRows)

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

      // reconcile(事务提交后;只对 active 应用 ensure 准入 accessRole;无变更的 no-op re-apply 不触发 KC 往返 —
      // 漂移修复是周期任务的职责,不是每次 no-op apply 的职责)
      const report: ReconcileReport = hasChanges(diff)
        ? await reconcile.ensureKeycloakRoles(
            doc.applications
              .filter((a) => a.status === 'active')
              .map((a) => ({ code: a.code, keycloakClientId: a.keycloak.clientId, accessClientRole: a.keycloak.accessRole })),
          )
        : { ensured: [], clientMissing: [], errors: [] }

      if (hasChanges(diff)) {
        await audit.append({
          ...actorOf(),
          action: 'catalog.apply',
          targetType: 'catalog',
          targetId: String(version),
          afterData: { version, diff, report },
          result: 'success',
        })
      }
      return { version, diff, report }
    },

    async listVersions() {
      return ctx.db
        .select({
          id: schema.catalogVersions.id,
          version: schema.catalogVersions.version,
          appliedBy: schema.catalogVersions.appliedBy,
          source: schema.catalogVersions.source,
          appliedAt: schema.catalogVersions.appliedAt,
        })
        .from(schema.catalogVersions)
        .orderBy(desc(schema.catalogVersions.version))
    },

    async getVersion(version: number) {
      const [row] = await ctx.db
        .select({ version: schema.catalogVersions.version, yaml: schema.catalogVersions.yaml, diff: schema.catalogVersions.diff })
        .from(schema.catalogVersions)
        .where(eq(schema.catalogVersions.version, version))
        .limit(1)
      return row as { version: number; yaml: string; diff: CatalogDiff | null } | undefined
    },

    async rollback(input: { version: number; expectedVersion?: number }): Promise<ApplyResult> {
      const target = await this.getVersion(input.version)
      if (!target) throw new ApiError('NOT_FOUND', `目录版本 ${input.version} 不存在`)
      return this.apply({ yaml: target.yaml, expectedVersion: input.expectedVersion, source: 'import' })
    },

    async confirmDeactivate(input: { appCode: string; roleCode?: string }): Promise<{
      kind: 'app' | 'role'; appCode: string; roleCode?: string; status: 'deactivated'; affectedAssignments: number
    }> {
      const flipped = await ctx.db.transaction(async (tx) => {
        const app = await tx.query.applications.findFirst({ where: eq(schema.applications.code, input.appCode) })
        if (!app) throw new ApiError('NOT_FOUND', `应用 ${input.appCode} 不存在`)
        if (input.roleCode) {
          const role = await tx.query.applicationRoles.findFirst({
            where: and(eq(schema.applicationRoles.applicationId, app.id), eq(schema.applicationRoles.code, input.roleCode)),
          })
          if (!role) throw new ApiError('NOT_FOUND', `角色 ${input.appCode}/${input.roleCode} 不存在`)
          if (role.status !== 'pending_deactivate') throw new ApiError('CONFLICT', `角色 ${input.roleCode} 非待停用态`)
          await tx.update(schema.applicationRoles).set({ status: 'deactivated', updatedAt: new Date() }).where(eq(schema.applicationRoles.id, role.id))
          return { kind: 'role' as const, appId: app.id, roleId: role.id }
        }
        if (app.status !== 'pending_deactivate') throw new ApiError('CONFLICT', `应用 ${input.appCode} 非待停用态`)
        await tx.update(schema.applications).set({ status: 'deactivated', updatedAt: new Date() }).where(eq(schema.applications.id, app.id))
        // 级联:该应用下所有非 deactivated 角色 → deactivated(应用已终态,角色随之)
        await tx.update(schema.applicationRoles).set({ status: 'deactivated', updatedAt: new Date() })
          .where(and(eq(schema.applicationRoles.applicationId, app.id), ne(schema.applicationRoles.status, 'deactivated')))
        return { kind: 'app' as const, appId: app.id }
      })

      const affected = flipped.kind === 'app'
        ? await countActiveAssignments(ctx.db, { appId: flipped.appId })
        : await countActiveAssignments(ctx.db, { roleId: flipped.roleId })

      await audit.append({
        ...actorOf(),
        action: 'catalog.deactivate',
        targetType: flipped.kind === 'app' ? 'application' : 'application_role',
        targetId: flipped.kind === 'app' ? flipped.appId : flipped.roleId,
        afterData: { appCode: input.appCode, roleCode: input.roleCode, status: 'deactivated', affectedAssignments: affected },
        result: 'success',
      })
      return { kind: flipped.kind, appCode: input.appCode, roleCode: input.roleCode, status: 'deactivated', affectedAssignments: affected }
    },
  }
}

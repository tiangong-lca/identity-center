import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createKeycloakAdmin } from '@/lib/keycloak/admin-client'
import { createCatalogService } from '@/server/services/catalog-service'
import type { ServiceContext } from '@/server/services/context'
import { getDbTargets } from './helpers/db-targets'
import { resolveAdminApiConfig } from './helpers/keycloak'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

const DOC = (name = 'TianGong LCA 平台', roles = ['admin', 'review-admin']) => `
version: 1
applications:
  - code: tiangong-lca
    name: ${name}
    keycloak: { clientId: tiangong-lca-business-app, accessRole: tiangong_lca_access }
    roles:
${roles.map((r) => `      - { code: ${r}, name: ${r} }`).join('\n')}
`

describe('catalog-service.apply(真实 PG + Keycloak)', () => {
  let tdb: TestDb
  let ctx: ServiceContext
  beforeAll(async () => {
    const [pg] = getDbTargets()
    tdb = await createMigratedTestDb(pg.adminUrl)
    ctx = { db: tdb.db, keycloak: createKeycloakAdmin(await resolveAdminApiConfig()) }
  })
  afterAll(async () => (tdb ? tdb.destroy() : undefined))

  it('首次 apply 建应用+角色+版本 1,reconcile ensured', async () => {
    const svc = createCatalogService(ctx)
    const r = await svc.apply({ yaml: DOC(), source: 'cli' })
    expect(r.version).toBe(1)
    expect(r.diff.created).toEqual(['tiangong-lca'])
    expect(r.report.ensured).toContain('tiangong-lca-business-app/tiangong_lca_access')
    const apps = await tdb.db.query.applications.findMany()
    expect(apps[0]).toMatchObject({ code: 'tiangong-lca', accessClientRole: 'tiangong_lca_access' })
  })

  it('同内容再 apply → 无变更,版本不变', async () => {
    const svc = createCatalogService(ctx)
    const r = await svc.apply({ yaml: DOC() })
    expect(r.version).toBe(1)
    expect(r.diff.created).toEqual([])
    expect(r.diff.unchanged).toEqual(['tiangong-lca'])
  })

  it('改名 → 版本 2 + updated', async () => {
    const svc = createCatalogService(ctx)
    const r = await svc.apply({ yaml: DOC('新名') })
    expect(r.version).toBe(2)
    expect(r.diff.updated).toEqual(['tiangong-lca'])
  })

  it('移除一个角色 → 该角色 pending_deactivate', async () => {
    const svc = createCatalogService(ctx)
    await svc.apply({ yaml: DOC('新名', ['admin']) })
    const roles = await tdb.db.query.applicationRoles.findMany()
    const removed = roles.find((r) => r.code === 'review-admin')
    expect(removed?.status).toBe('pending_deactivate')
  })

  it('getCurrent 返回渲染 YAML + 当前版本', async () => {
    const svc = createCatalogService(ctx)
    const cur = await svc.getCurrent()
    expect(cur.version).toBeGreaterThanOrEqual(3)
    expect(cur.yaml).toContain('code: tiangong-lca')
  })

  it('expectedVersion 过期 → CONFLICT', async () => {
    const svc = createCatalogService(ctx)
    await expect(svc.apply({ yaml: DOC('再改'), expectedVersion: 1 })).rejects.toThrow(/CONFLICT|版本冲突/)
  })
})

describe('catalog-service 版本 + 回滚', () => {
  let tdb2: TestDb
  let ctx2: ServiceContext
  beforeAll(async () => {
    const [pg] = getDbTargets()
    tdb2 = await createMigratedTestDb(pg.adminUrl)
    ctx2 = { db: tdb2.db, keycloak: createKeycloakAdmin(await resolveAdminApiConfig()) }
  })
  afterAll(async () => (tdb2 ? tdb2.destroy() : undefined))

  it('listVersions 按版本倒序;rollback 到旧 yaml 产生新版本并恢复名字', async () => {
    const svc = createCatalogService(ctx2)
    await svc.apply({ yaml: DOC('原名') }) // v1
    await svc.apply({ yaml: DOC('改名') }) // v2
    const versions = await svc.listVersions()
    expect(versions[0].version).toBe(2)

    const r = await svc.rollback({ version: 1 }) // 回到"原名"
    expect(r.version).toBe(3)
    const apps = await tdb2.db.query.applications.findMany()
    expect(apps[0].name).toBe('原名')
  })
})

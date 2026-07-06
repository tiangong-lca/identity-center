import { beforeAll, describe, expect, it } from 'vitest'
import { createKeycloakAdmin } from '@/lib/keycloak/admin-client'
import { createCatalogReconcileService } from '@/server/services/catalog-reconcile-service'
import type { ServiceContext } from '@/server/services/context'
import { resolveAdminApiConfig } from './helpers/keycloak'

describe('catalog-reconcile-service(真实 Keycloak)', () => {
  let ctx: ServiceContext
  beforeAll(async () => {
    ctx = { db: {} as ServiceContext['db'], keycloak: createKeycloakAdmin(await resolveAdminApiConfig()) }
  })

  it('已有 client → ensure accessRole 幂等成功', async () => {
    const svc = createCatalogReconcileService(ctx)
    const apps = [{ code: 'tiangong-lca', keycloakClientId: 'tiangong-lca-business-app', accessClientRole: 'tiangong_lca_access' }]
    const r1 = await svc.ensureKeycloakRoles(apps)
    const r2 = await svc.ensureKeycloakRoles(apps)
    expect(r1.ensured).toContain('tiangong-lca-business-app/tiangong_lca_access')
    expect(r2.ensured).toContain('tiangong-lca-business-app/tiangong_lca_access')
    expect(r1.clientMissing).toEqual([])
  })

  it('client 不存在 → 记 clientMissing,不阻断其它 app', async () => {
    const svc = createCatalogReconcileService(ctx)
    const r = await svc.ensureKeycloakRoles([
      { code: 'ghost', keycloakClientId: 'no-such-client', accessClientRole: 'ghost_access' },
      { code: 'tiangong-lca', keycloakClientId: 'tiangong-lca-business-app', accessClientRole: 'tiangong_lca_access' },
    ])
    expect(r.clientMissing).toEqual(['ghost'])
    expect(r.ensured).toContain('tiangong-lca-business-app/tiangong_lca_access')
  })
})

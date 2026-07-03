import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedBusinessApps } from '@/scripts/seed/business-apps'
import { createRegistrationService } from '@/server/services/registration-service'
import type { ServiceContext } from '@/server/services/context'
import { getDbTargets } from './helpers/db-targets'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

describe('registration submit: requestedAccess (D7)', () => {
  let tdb: TestDb
  let ctx: ServiceContext

  beforeAll(async () => {
    const [pg] = getDbTargets()
    tdb = await createMigratedTestDb(pg.adminUrl)
    ctx = { db: tdb.db, keycloak: null as never }
    await seedBusinessApps(tdb.db)
  })

  afterAll(async () => {
    await tdb?.destroy()
  })

  it('合法选择随申请落库', async () => {
    const svc = createRegistrationService(ctx)
    const row = await svc.submit({
      email: 'u1@test.local',
      requestedAccess: [{ applicationCode: 'tiangong-lca', roleCode: 'review-admin' }],
    })
    expect(row.requestedAccess).toEqual([
      { applicationCode: 'tiangong-lca', roleCode: 'review-admin' },
    ])
  })

  it.each([
    [[{ applicationCode: 'no-such-app' }], /应用/],
    [[{ applicationCode: 'tiangong-lca', roleCode: 'no-such-role' }], /角色/],
  ])('非法选择被拒: %#', async (requestedAccess, msg) => {
    const svc = createRegistrationService(ctx)
    await expect(
      svc.submit({ email: `bad-${Math.random()}@test.local`, requestedAccess }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', message: expect.stringMatching(msg) })
  })
})

import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createKeycloakAdmin } from '@/lib/keycloak/admin-client'
import { migrateLegacyUsers, type LegacyUser } from '@/scripts/migrate-legacy-users'
import { getDbTargets } from './helpers/db-targets'
import { resolveAdminApiConfig } from './helpers/keycloak'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

const pg = getDbTargets()[0]
const suffix = randomUUID().slice(0, 8)

describe('存量用户迁移(真实 PG + Keycloak)', () => {
  let tdb: TestDb
  let kc: ReturnType<typeof createKeycloakAdmin>
  let existingEmail: string
  let kcUserId: string

  beforeAll(async () => {
    tdb = await createMigratedTestDb(pg.adminUrl)
    kc = createKeycloakAdmin(await resolveAdminApiConfig())
    // 预置一个已验证邮箱的 KC 用户(可匹配)
    existingEmail = `legacy-${suffix}@test.local`
    kcUserId = await kc.createUser({ email: existingEmail, emailVerified: true, temporaryPassword: 'Legacy-2026-Pass' })
  })

  afterAll(async () => {
    if (kcUserId) await kc.deleteUser(kcUserId).catch(() => {})
    await tdb?.destroy()
  })

  it('已验证邮箱命中 → created;无匹配 → manual;重跑 → matched(幂等)', async () => {
    const legacy: LegacyUser[] = [
      { email: existingEmail, displayName: '存量甲', externalId: 'legacy-1' },
      { email: `nobody-${suffix}@test.local`, username: 'ghost' },
    ]
    const first = await migrateLegacyUsers(tdb.db, kc, legacy)
    expect(first.find((o) => o.legacy.email === existingEmail)?.result).toBe('created')
    expect(first.find((o) => o.legacy.username === 'ghost')?.result).toBe('manual')

    const second = await migrateLegacyUsers(tdb.db, kc, legacy)
    expect(second.find((o) => o.legacy.email === existingEmail)?.result).toBe('matched')
  })
})

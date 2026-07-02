import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { createPortalUsersRepository } from '@/server/repositories/portal-users-repository'
import { getDbTargets } from './helpers/db-targets'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

const pg = getDbTargets()[0]

describe('PII 字段加密(phone,真实 PG)', () => {
  let tdb: TestDb
  const prevKey = process.env.PII_ENCRYPTION_KEY

  beforeAll(async () => {
    tdb = await createMigratedTestDb(pg.adminUrl)
    process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64')
  })

  afterAll(async () => {
    process.env.PII_ENCRYPTION_KEY = prevKey
    await tdb?.destroy()
  })

  it('手机号密文入库(DB 原值非明文)且可解密还原', async () => {
    const repo = createPortalUsersRepository(tdb.db)
    const user = await repo.create({ keycloakSub: 'pii-sub-1', email: 'pii@test.local' })
    await repo.setPhone(user.id, '13800138000')

    // 直查 DB:列值为密文,不含明文
    const raw = await tdb.db.query.portalUsers.findFirst({
      where: eq(schema.portalUsers.id, user.id),
    })
    expect(raw?.phoneEncrypted).toBeTruthy()
    expect(raw?.phoneEncrypted).not.toContain('13800138000')
    expect(raw?.phoneEncrypted?.startsWith('v1.')).toBe(true)

    // 经 repository 解密还原
    expect(await repo.getPhone(user.id)).toBe('13800138000')
  })

  it('未配置密钥时拒绝写入明文', async () => {
    const repo = createPortalUsersRepository(tdb.db)
    const user = await repo.create({ keycloakSub: 'pii-sub-2', email: 'pii2@test.local' })
    const prev = process.env.PII_ENCRYPTION_KEY
    delete process.env.PII_ENCRYPTION_KEY
    await expect(repo.setPhone(user.id, '13800138000')).rejects.toThrow()
    process.env.PII_ENCRYPTION_KEY = prev
  })
})

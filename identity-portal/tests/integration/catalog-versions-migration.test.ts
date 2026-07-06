import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getDbTargets } from './helpers/db-targets'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

describe('catalog_versions 迁移', () => {
  let tdb: TestDb
  beforeAll(async () => {
    const [pg] = getDbTargets()
    tdb = await createMigratedTestDb(pg.adminUrl)
  })
  afterAll(async () => (tdb ? tdb.destroy() : undefined))

  it('表存在,可插入并读回', async () => {
    await tdb.db.insert(schema.catalogVersions).values({ version: 1, yaml: 'version: 1', appliedBy: 'system' })
    const rows = await tdb.db.query.catalogVersions.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ version: 1, appliedBy: 'system', source: 'cli' })
  })

  it('version 唯一约束生效', async () => {
    await expect(
      tdb.db.insert(schema.catalogVersions).values({ version: 1, yaml: 'x', appliedBy: 'system' }),
    ).rejects.toThrow()
  })
})

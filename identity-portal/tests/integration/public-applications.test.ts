import { NextRequest } from 'next/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { seedBusinessApps } from '@/scripts/seed/business-apps'
import { __setServiceContextForTests } from '@/server/services/context'
import { getDbTargets } from './helpers/db-targets'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

// _helpers.ts 在模块顶层无条件导入真实 @/lib/auth(即便 publicRoute 本身不调用 auth()),
// 会链式加载 next-auth → next/server,在当前 Vitest 转换链下解析失败;
// 对齐 api-contract.test.ts 的既有处理方式:mock 掉 @/lib/auth(vi.mock 会被提升到文件顶部,先于下方 import 执行)。
vi.mock('@/lib/auth', () => ({
  auth: async () => null,
  handlers: { GET: () => {}, POST: () => {} },
  signIn: async () => {},
  signOut: async () => {},
  ADMIN_CONSOLE_ROLE: 'admin_console_access',
}))

import { GET } from '@/app/api/public/applications/route'

describe('GET /api/public/applications', () => {
  let tdb: TestDb
  beforeAll(async () => {
    const [pg] = getDbTargets()
    tdb = await createMigratedTestDb(pg.adminUrl)
    __setServiceContextForTests({ db: tdb.db, keycloak: null as never })
    await seedBusinessApps(tdb.db)
  })
  afterAll(async () => {
    __setServiceContextForTests(null)
    await tdb?.destroy()
  })

  it('返回 active 应用及其 active 角色的 code/name', async () => {
    const res = await GET(new NextRequest('http://test.local/api/public/applications'))
    expect(res.status).toBe(200)
    const body = await res.json()
    const app = body.data.items.find((a: { code: string }) => a.code === 'tiangong-lca')
    expect(app).toBeTruthy()
    expect(app.roles.map((r: { code: string }) => r.code).sort()).toEqual([
      'admin', 'review-admin', 'review-member',
    ])
    expect(app.keycloakClientId).toBeUndefined() // 不泄露超出 code/name 的字段
  })
})

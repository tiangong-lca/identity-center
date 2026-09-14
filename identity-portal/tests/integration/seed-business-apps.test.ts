import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import { seedBusinessApps } from '@/scripts/seed/business-apps'
import { getDbTargets } from './helpers/db-targets'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

describe('seedBusinessApps(config/business-apps.yaml)', () => {
  let tdb: TestDb
  beforeAll(async () => {
    const [pg] = getDbTargets()
    tdb = await createMigratedTestDb(pg.adminUrl)
  })
  afterAll(async () => (tdb ? tdb.destroy() : undefined))
  afterEach(() => vi.unstubAllEnvs())

  it('幂等登记 tiangong-lca 与 cms 两个业务应用及其角色', async () => {
    // 占位解析按进程 env:${NAME} 未定义时可选字段落空,webhook.url 缺失则整个 webhook
    // 省略(lib/catalog/serialize.ts)。stub 固化 CMS_* 以免断言依赖开发机 .env 配置。
    vi.stubEnv('CMS_WEBHOOK_URL', 'http://localhost:54321/functions/v1/cms_identity_webhook')
    vi.stubEnv('CMS_LOGIN_URL', 'http://localhost:8000/#/user/login')
    await seedBusinessApps(tdb.db)
    await seedBusinessApps(tdb.db)
    const apps = await tdb.db.query.applications.findMany()
    expect(apps).toHaveLength(2)
    const tiangong = apps.find((a) => a.code === 'tiangong-lca')
    const cms = apps.find((a) => a.code === 'cms')
    expect(tiangong).toMatchObject({
      name: 'TianGong LCA 平台',
      status: 'active',
      keycloakClientId: 'tiangong-lca-business-app',
      accessClientRole: 'tiangong_lca_access',
      webhookSecretRef: 'TIANGONG_LCA_WEBHOOK_SECRET',
    })
    expect(cms).toMatchObject({
      name: '内容管理系统',
      status: 'active',
      keycloakClientId: 'cms-business-app',
      accessClientRole: 'cms_access',
      webhookSecretRef: 'CMS_WEBHOOK_SECRET',
    })
    const tiangongRoles = await tdb.db.query.applicationRoles.findMany({
      where: eq(schema.applicationRoles.applicationId, tiangong!.id),
    })
    expect(tiangongRoles.map((r) => r.code).sort()).toEqual(['admin', 'review-admin', 'review-member'])
    // cms 方案 A:yaml 不登记 roles(CMS 内部角色自治),角色目录为空;准入走 accessClientRole 投影
    const cmsRoles = await tdb.db.query.applicationRoles.findMany({
      where: eq(schema.applicationRoles.applicationId, cms!.id),
    })
    expect(cmsRoles.map((r) => r.code)).toEqual([])
  })
})

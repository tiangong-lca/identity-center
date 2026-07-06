// tests/unit/catalog-serialize.test.ts
import { describe, expect, it } from 'vitest'
import { parseCatalogYaml, renderCatalogYaml, toCatalogApps } from '@/lib/catalog/serialize'

const yamlText = `
version: 1
applications:
  - code: tiangong-lca
    name: TianGong LCA 平台
    keycloak: { clientId: tiangong-lca-business-app, accessRole: tiangong_lca_access }
    webhook: { url: "\${TIANGONG_LCA_WEBHOOK_URL}", secretRef: TIANGONG_LCA_WEBHOOK_SECRET }
    loginUrl: \${TIANGONG_LCA_LOGIN_URL}
    roles:
      - { code: admin, name: 系统管理员 }
      - { code: review-admin, name: 评审管理员 }
`

describe('parseCatalogYaml', () => {
  it('解析 + ${ENV} 插值(url/loginUrl 用 env,secretRef 不插值)', () => {
    const doc = parseCatalogYaml(yamlText, {
      TIANGONG_LCA_WEBHOOK_URL: 'http://localhost:54321/functions/v1/identity_center_webhook',
      TIANGONG_LCA_LOGIN_URL: 'http://localhost:8000/#/user/login',
    } as unknown as NodeJS.ProcessEnv)
    expect(doc.applications[0].webhook?.url).toBe('http://localhost:54321/functions/v1/identity_center_webhook')
    expect(doc.applications[0].webhook?.secretRef).toBe('TIANGONG_LCA_WEBHOOK_SECRET')
    expect(doc.applications[0].loginUrl).toBe('http://localhost:8000/#/user/login')
  })
  it('可选字段的 ${ENV} 未定义 → 该字段省略(不报错)', () => {
    const doc = parseCatalogYaml(yamlText, {} as NodeJS.ProcessEnv)
    expect(doc.applications[0].webhook).toBeUndefined()
    expect(doc.applications[0].loginUrl).toBeUndefined()
  })
  it('非法 YAML 抛错', () => {
    expect(() => parseCatalogYaml('::: not yaml :::')).toThrow()
  })
})

describe('renderCatalogYaml + toCatalogApps 回环', () => {
  it('DB 行 → CatalogApp → YAML → 再解析,应用/角色保持', () => {
    const apps = toCatalogApps(
      [{ id: 'a1', code: 'tiangong-lca', name: 'TianGong LCA 平台', status: 'active', keycloakClientId: 'tiangong-lca-business-app', accessClientRole: 'tiangong_lca_access', webhookUrl: 'http://x/hook', webhookSecretRef: 'TIANGONG_LCA_WEBHOOK_SECRET', loginUrl: null, adminUrl: null }],
      [{ id: 'r1', applicationId: 'a1', code: 'admin', name: '系统管理员', description: null, status: 'active' }],
    )
    const text = renderCatalogYaml(apps)
    const doc = parseCatalogYaml(text, {} as NodeJS.ProcessEnv)
    expect(doc.applications[0].code).toBe('tiangong-lca')
    expect(doc.applications[0].roles.map((r) => r.code)).toEqual(['admin'])
  })
  it('toCatalogApps 过滤 pending_deactivate 的应用与角色', () => {
    const apps = toCatalogApps(
      [{ id: 'a1', code: 'gone', name: 'X', status: 'pending_deactivate', keycloakClientId: 'c', accessClientRole: 'c_access', webhookUrl: null, webhookSecretRef: null, loginUrl: null, adminUrl: null }],
      [],
    )
    expect(apps).toHaveLength(0)
  })
  it('webhookUrl 有值但 webhookSecretRef 为 null → webhook 省略(不合成空 secretRef)', () => {
    const apps = toCatalogApps(
      [{ id: 'a1', code: 'tiangong-lca', name: 'TianGong LCA 平台', status: 'active', keycloakClientId: 'tiangong-lca-business-app', accessClientRole: 'tiangong_lca_access', webhookUrl: 'http://x/hook', webhookSecretRef: null, loginUrl: null, adminUrl: null }],
      [],
    )
    expect(apps).toHaveLength(1)
    expect(apps[0].webhook).toBeUndefined()
  })
  it('webhookUrl 与 webhookSecretRef 均有值 → webhook 完整输出(happy path)', () => {
    const apps = toCatalogApps(
      [{ id: 'a1', code: 'tiangong-lca', name: 'TianGong LCA 平台', status: 'active', keycloakClientId: 'tiangong-lca-business-app', accessClientRole: 'tiangong_lca_access', webhookUrl: 'http://x/hook', webhookSecretRef: 'TIANGONG_LCA_WEBHOOK_SECRET', loginUrl: null, adminUrl: null }],
      [],
    )
    expect(apps[0].webhook).toEqual({ url: 'http://x/hook', secretRef: 'TIANGONG_LCA_WEBHOOK_SECRET' })
  })
})

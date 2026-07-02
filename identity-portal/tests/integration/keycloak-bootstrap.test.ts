import { describe, expect, it } from 'vitest'

const BASE = process.env.KEYCLOAK_BASE_URL ?? 'http://localhost:8080'
const REALM = process.env.KEYCLOAK_REALM ?? 'company-dev'

describe('keycloak bootstrap(需 compose 环境 + 已执行 bootstrap 脚本)', () => {
  it('realm 的 OIDC discovery 可用', async () => {
    const res = await fetch(`${BASE}/realms/${REALM}/.well-known/openid-configuration`)
    expect(res.status).toBe(200)
    const doc = (await res.json()) as { issuer: string; authorization_endpoint: string }
    expect(doc.issuer).toBe(`${BASE}/realms/${REALM}`)
    expect(doc.authorization_endpoint).toContain(`/realms/${REALM}/protocol/openid-connect/auth`)
  })

  it('登录页支持 zh-CN(默认)', async () => {
    const res = await fetch(
      `${BASE}/realms/${REALM}/protocol/openid-connect/auth?client_id=user-portal&response_type=code&redirect_uri=http://localhost:3000/api/auth/callback/keycloak&scope=openid`,
    )
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('lang="zh-CN"')
  })
})

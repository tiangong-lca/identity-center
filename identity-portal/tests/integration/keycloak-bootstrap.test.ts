import { createHash, randomBytes } from 'node:crypto'
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

  it('登录页渲染且默认 zh-CN(client 强制 PKCE S256)', async () => {
    const verifier = randomBytes(32).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const params = new URLSearchParams({
      client_id: 'user-portal',
      response_type: 'code',
      redirect_uri: 'http://localhost:3000/api/auth/callback/keycloak',
      scope: 'openid',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    })
    const res = await fetch(
      `${BASE}/realms/${REALM}/protocol/openid-connect/auth?${params}`,
    )
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('lang="zh-CN"')
  })

  it('缺少 PKCE 参数的授权请求被拒绝(错误重定向,不出登录页)', async () => {
    const params = new URLSearchParams({
      client_id: 'user-portal',
      response_type: 'code',
      redirect_uri: 'http://localhost:3000/api/auth/callback/keycloak',
      scope: 'openid',
    })
    const res = await fetch(
      `${BASE}/realms/${REALM}/protocol/openid-connect/auth?${params}`,
      { redirect: 'manual' },
    )
    expect(res.status).toBe(302)
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('error=invalid_request')
    expect(location).toContain('code_challenge_method')
  })
})

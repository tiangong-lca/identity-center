import { describe, expect, it } from 'vitest'
import { buildEndSessionUrl } from '@/lib/auth/end-session'

describe('Keycloak end-session URL(登出第二层)', () => {
  it('带 id_token_hint 指向 realm logout 端点', () => {
    const url = new URL(buildEndSessionUrl('fake.id.token'))
    expect(url.pathname).toBe('/realms/company-dev/protocol/openid-connect/logout')
    expect(url.searchParams.get('id_token_hint')).toBe('fake.id.token')
  })

  it('可附 post_logout_redirect_uri', () => {
    const url = new URL(buildEndSessionUrl('t', 'http://localhost:3000/'))
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe('http://localhost:3000/')
  })

  it('无 id_token 时仍返回合法 logout URL(不注入空 hint)', () => {
    const url = new URL(buildEndSessionUrl(undefined))
    expect(url.pathname).toContain('/logout')
    expect(url.searchParams.has('id_token_hint')).toBe(false)
  })
})

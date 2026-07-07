import { describe, it, expect } from 'vitest'
import { scanForPlaintextSecrets, type SecretFinding } from '@/lib/catalog/secret-scan'
import type { CatalogDoc } from '@/lib/catalog/schema'

const doc = (url: string): CatalogDoc => ({
  version: 1,
  applications: [{
    code: 'x', name: 'X', status: 'active',
    keycloak: { clientId: 'cx', accessRole: 'rx' },
    webhook: { url, secretRef: 'X_SECRET' },
    roles: [],
  }],
})

describe('scanForPlaintextSecrets', () => {
  it('干净配置无 finding', () => {
    expect(scanForPlaintextSecrets(doc('https://x.example/hook'))).toEqual([])
  })
  it('命中 URL 里的 token 参数', () => {
    const f = scanForPlaintextSecrets(doc('https://x.example/hook?token=abcd1234secret'))
    expect(f.length).toBe(1)
    expect(f[0].path).toBe('applications[0].webhook.url')
    expect(f[0].pattern).toBe('url-credential')
  })
  it('命中 Bearer / PEM / AKIA / JWT', () => {
    expect(scanForPlaintextSecrets(doc('Bearer abcdefgh12345')).length).toBe(1)
    expect(scanForPlaintextSecrets(doc('-----BEGIN PRIVATE KEY-----')).length).toBe(1)
    expect(scanForPlaintextSecrets(doc('AKIAIOSFODNN7EXAMPLE')).length).toBe(1)
    expect(scanForPlaintextSecrets(doc('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig123456')).length).toBe(1)
  })
  it('finding 绝不含命中的密文子串(安全铁律)', () => {
    const secret = 'abcd1234supersecretvalue'
    const f: SecretFinding[] = scanForPlaintextSecrets(doc(`https://x/h?token=${secret}`))
    const blob = JSON.stringify(f)
    expect(blob).not.toContain(secret)
    expect(blob).not.toContain('supersecret')
  })
})

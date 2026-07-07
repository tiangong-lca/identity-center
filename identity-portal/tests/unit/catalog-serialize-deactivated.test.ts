import { describe, it, expect } from 'vitest'
import { toCatalogApps } from '@/lib/catalog/serialize'

const app = (code: string, status: string) => ({
  id: code, code, name: code.toUpperCase(), status,
  keycloakClientId: `c-${code}`, accessClientRole: `r-${code}`,
  webhookUrl: null, webhookSecretRef: null, loginUrl: null, adminUrl: null,
})

describe('toCatalogApps 过滤 deactivated', () => {
  it('排除 deactivated 应用,保留 active/disabled', () => {
    const out = toCatalogApps([app('a', 'active'), app('b', 'deactivated'), app('c', 'disabled')], [])
    expect(out.map((a) => a.code)).toEqual(['a', 'c'])
  })
  it('排除 deactivated 角色', () => {
    const roles = [
      { id: 'r1', applicationId: 'a', code: 'keep', name: 'Keep', description: null, status: 'active' },
      { id: 'r2', applicationId: 'a', code: 'gone', name: 'Gone', description: null, status: 'deactivated' },
    ]
    const out = toCatalogApps([app('a', 'active')], roles)
    expect(out[0].roles.map((r) => r.code)).toEqual(['keep'])
  })
})

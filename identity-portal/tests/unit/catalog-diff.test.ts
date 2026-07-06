// tests/unit/catalog-diff.test.ts
import { describe, expect, it } from 'vitest'
import { computeCatalogDiff, hasChanges } from '@/lib/catalog/diff'
import type { CatalogApp } from '@/lib/catalog/schema'

const app = (over: Partial<CatalogApp> = {}): CatalogApp => ({
  code: 'tiangong-lca',
  name: 'TianGong LCA 平台',
  status: 'active',
  keycloak: { clientId: 'tiangong-lca-business-app', accessRole: 'tiangong_lca_access' },
  roles: [{ code: 'admin', name: '系统管理员' }],
  ...over,
})

describe('computeCatalogDiff', () => {
  it('新增应用', () => {
    const d = computeCatalogDiff([], [app()])
    expect(d.created).toEqual(['tiangong-lca'])
    expect(hasChanges(d)).toBe(true)
  })
  it('同内容 → unchanged,hasChanges=false', () => {
    const d = computeCatalogDiff([app()], [app()])
    expect(d.unchanged).toEqual(['tiangong-lca'])
    expect(d.created).toEqual([])
    expect(hasChanges(d)).toBe(false)
  })
  it('改名 → updated', () => {
    const d = computeCatalogDiff([app()], [app({ name: '新名' })])
    expect(d.updated).toEqual(['tiangong-lca'])
  })
  it('YAML 移除应用 → pendingDeactivate', () => {
    const d = computeCatalogDiff([app()], [])
    expect(d.pendingDeactivate).toEqual(['tiangong-lca'])
  })
  it('新增/移除角色 → roles.created / roles.pendingDeactivate', () => {
    const d = computeCatalogDiff(
      [app({ roles: [{ code: 'admin', name: '系统管理员' }] })],
      [app({ roles: [{ code: 'review-admin', name: '评审管理员' }] })],
    )
    expect(d.roles.created).toEqual(['tiangong-lca/review-admin'])
    expect(d.roles.pendingDeactivate).toEqual(['tiangong-lca/admin'])
  })
})

import { describe, expect, it } from 'vitest'
import { PERMISSIONS, ROLE_PERMISSION_MAP } from '@/scripts/seed/admin-rbac'

describe('catalog 权限', () => {
  it('PERMISSIONS 含 catalog:read + catalog:apply', () => {
    const codes = PERMISSIONS.map((p) => p.code)
    expect(codes).toContain('catalog:read')
    expect(codes).toContain('catalog:apply')
  })
  it('app_admin 含 catalog:read + catalog:apply', () => {
    expect(ROLE_PERMISSION_MAP.app_admin).toContain('catalog:read')
    expect(ROLE_PERMISSION_MAP.app_admin).toContain('catalog:apply')
  })
  it('auditor 经 ALL_READ 得 catalog:read(且不含 catalog:apply)', () => {
    expect(ROLE_PERMISSION_MAP.auditor).toContain('catalog:read')
    expect(ROLE_PERMISSION_MAP.auditor).not.toContain('catalog:apply')
  })
})

import { describe, expect, it } from 'vitest'
import { can, canWithReason } from '@/lib/permissions/evaluate'
import type { AdminGrant } from '@/lib/permissions/types'

const grant = (partial: Partial<AdminGrant>): AdminGrant => ({
  roleCode: 'user_admin',
  permissionCodes: ['user:read'],
  scopeType: 'global',
  scopeId: '',
  ...partial,
})

describe('lib/permissions 评估器', () => {
  it('platform_admin 短路拥有一切', () => {
    const grants = [grant({ roleCode: 'platform_admin', permissionCodes: [] })]
    expect(can(grants, 'user:disable')).toBe(true)
    expect(can(grants, 'settings:manage', { type: 'app', id: 'a1' })).toBe(true)
  })

  it('global 授权覆盖任意 scope', () => {
    const grants = [grant({ permissionCodes: ['user:disable'] })]
    expect(can(grants, 'user:disable')).toBe(true)
    expect(can(grants, 'user:disable', { type: 'org', id: 'o1' })).toBe(true)
  })

  it('org 范围授权只覆盖该 org', () => {
    const grants = [
      grant({ scopeType: 'org', scopeId: 'o1', permissionCodes: ['user:disable'] }),
    ]
    expect(can(grants, 'user:disable', { type: 'org', id: 'o1' })).toBe(true)
    expect(can(grants, 'user:disable', { type: 'org', id: 'o2' })).toBe(false)
    // 只有范围授权时,无 scope 的 global 校验拒绝
    expect(can(grants, 'user:disable')).toBe(false)
  })

  it('缺权限拒绝且原因仅内部可见', () => {
    const d = canWithReason([grant({})], 'user:disable')
    expect(d.allowed).toBe(false)
    expect(d.internalReason).toContain('user:disable')
  })

  it('app 范围精确匹配', () => {
    const grants = [
      grant({ scopeType: 'app', scopeId: 'app-1', permissionCodes: ['app:assign'] }),
    ]
    expect(can(grants, 'app:assign', { type: 'app', id: 'app-1' })).toBe(true)
    expect(can(grants, 'app:assign', { type: 'app', id: 'app-2' })).toBe(false)
  })
})

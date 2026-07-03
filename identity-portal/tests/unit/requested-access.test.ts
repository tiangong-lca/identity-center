import { describe, expect, it } from 'vitest'
import { requestedAccessSchema } from '@/lib/registration/requested-access'

describe('requestedAccessSchema', () => {
  it('接受多应用且每应用可选单角色', () => {
    const r = requestedAccessSchema.safeParse([
      { applicationCode: 'tiangong-lca', roleCode: 'review-admin' },
      { applicationCode: 'another-app' },
    ])
    expect(r.success).toBe(true)
  })
  it.each([
    [[{ applicationCode: 'a' }, { applicationCode: 'a' }], '重复应用'],
    [[{ applicationCode: '' }], '空 code'],
    [Array.from({ length: 21 }, (_, i) => ({ applicationCode: `app-${i}` })), '超长'],
  ])('拒绝非法输入: %#', (input) => {
    expect(requestedAccessSchema.safeParse(input).success).toBe(false)
  })
})

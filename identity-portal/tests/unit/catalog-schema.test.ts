// tests/unit/catalog-schema.test.ts
import { describe, expect, it } from 'vitest'
import { catalogDocSchema } from '@/lib/catalog/schema'

const valid = {
  version: 1,
  applications: [
    {
      code: 'tiangong-lca',
      name: 'TianGong LCA 平台',
      keycloak: { clientId: 'tiangong-lca-business-app', accessRole: 'tiangong_lca_access' },
      webhook: { url: 'http://x/hook', secretRef: 'TIANGONG_LCA_WEBHOOK_SECRET' },
      roles: [
        { code: 'admin', name: '系统管理员' },
        { code: 'review-admin', name: '评审管理员', description: '评审流程管理员' },
      ],
    },
  ],
}

describe('catalogDocSchema', () => {
  it('合法文档通过,status 默认 active,roles 默认 []', () => {
    const doc = catalogDocSchema.parse(valid)
    expect(doc.applications[0].status).toBe('active')
    expect(doc.applications[0].roles).toHaveLength(2)
  })
  it('role.code 允许连字符(review-admin)', () => {
    expect(() => catalogDocSchema.parse(valid)).not.toThrow()
  })
  it('app.code 非法(大写)被拒', () => {
    const bad = structuredClone(valid)
    bad.applications[0].code = 'TianGong'
    expect(() => catalogDocSchema.parse(bad)).toThrow()
  })
  it('secretRef 为明文样式(小写)被拒', () => {
    const bad = structuredClone(valid)
    bad.applications[0].webhook.secretRef = 'super-secret-value'
    expect(() => catalogDocSchema.parse(bad)).toThrow()
  })
  it('同文件重复 app code 被拒', () => {
    const bad = structuredClone(valid)
    bad.applications.push(structuredClone(valid.applications[0]))
    expect(() => catalogDocSchema.parse(bad)).toThrow(/重复应用 code/)
  })
  it('应用内重复 role code 被拒', () => {
    const bad = structuredClone(valid)
    bad.applications[0].roles.push({ code: 'admin', name: '重复' })
    expect(() => catalogDocSchema.parse(bad)).toThrow(/重复角色 code/)
  })
})

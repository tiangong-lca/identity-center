// tests/unit/catalog-json-schema.test.ts
import { describe, expect, it } from 'vitest'
import { catalogJsonSchema } from '@/lib/catalog/schema'

describe('catalogJsonSchema', () => {
  it('是含 applications 的 JSON Schema 对象', () => {
    expect(catalogJsonSchema).toBeTypeOf('object')
    const s = JSON.stringify(catalogJsonSchema)
    expect(s).toContain('applications')
    expect(s).toContain('keycloak')
    expect(s).toContain('secretRef')
  })
})

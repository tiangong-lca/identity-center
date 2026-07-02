import { describe, expect, it } from 'vitest'
import { validateEnv } from '@/lib/config/env-schema'

describe('validateEnv', () => {
  it('rejects missing DATABASE_URL', () => {
    const r = validateEnv({})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.missing).toContain('DATABASE_URL')
  })

  it('rejects malformed KEYCLOAK_BASE_URL', () => {
    const r = validateEnv({
      DATABASE_URL: 'postgres://identity:identity@localhost:5432/identity_platform',
      KEYCLOAK_BASE_URL: 'not-a-url',
      KEYCLOAK_REALM: 'company-dev',
      REDIS_URL: 'redis://localhost:6379',
      RABBITMQ_URL: 'amqp://identity:identity@localhost:5672',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.missing).toContain('KEYCLOAK_BASE_URL')
  })

  it('accepts complete env and ignores extras', () => {
    const r = validateEnv({
      DATABASE_URL: 'postgres://identity:identity@localhost:5432/identity_platform',
      KEYCLOAK_BASE_URL: 'http://localhost:8080',
      KEYCLOAK_REALM: 'company-dev',
      REDIS_URL: 'redis://localhost:6379',
      RABBITMQ_URL: 'amqp://identity:identity@localhost:5672',
      SOME_OTHER: 'x',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.env.KEYCLOAK_REALM).toBe('company-dev')
  })
})

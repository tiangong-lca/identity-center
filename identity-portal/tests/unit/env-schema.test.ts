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
      DATABASE_URL: 'postgres://identity:identity@localhost:15432/identity_platform',
      KEYCLOAK_BASE_URL: 'not-a-url',
      KEYCLOAK_REALM: 'company-dev',
      REDIS_URL: 'redis://:redis-pass@localhost:16379',
      RABBITMQ_URL: 'amqp://identity:identity@localhost:5672',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.missing).toContain('KEYCLOAK_BASE_URL')
  })

  it('accepts complete env and ignores extras', () => {
    const r = validateEnv({
      DATABASE_URL: 'postgres://identity:identity@localhost:15432/identity_platform',
      KEYCLOAK_BASE_URL: 'http://localhost:8080',
      KEYCLOAK_REALM: 'company-dev',
      REDIS_URL: 'redis://:redis-pass@localhost:16379',
      RABBITMQ_URL: 'amqp://identity:identity@localhost:5672',
      AUTH_SECRET: 'x'.repeat(44),
      KEYCLOAK_CLIENT_ID: 'user-portal',
      KEYCLOAK_CLIENT_SECRET: 'secret',
      KEYCLOAK_ADMIN_API_CLIENT_SECRET: 'secret2',
      SOME_OTHER: 'x',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.env.KEYCLOAK_REALM).toBe('company-dev')
  })

  it('rejects missing AUTH_SECRET', () => {
    const r = validateEnv({
      DATABASE_URL: 'postgres://identity:identity@localhost:15432/identity_platform',
      KEYCLOAK_BASE_URL: 'http://localhost:8080',
      KEYCLOAK_REALM: 'company-dev',
      REDIS_URL: 'redis://:redis-pass@localhost:16379',
      RABBITMQ_URL: 'amqp://identity:identity@localhost:5672',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.missing).toContain('AUTH_SECRET')
  })

  it('rejects REDIS_URL without a password', () => {
    const r = validateEnv({
      DATABASE_URL: 'postgres://identity:identity@localhost:15432/identity_platform',
      KEYCLOAK_BASE_URL: 'http://localhost:8080',
      KEYCLOAK_REALM: 'company-dev',
      REDIS_URL: 'redis://localhost:16379',
      RABBITMQ_URL: 'amqp://identity:identity@localhost:5672',
      AUTH_SECRET: 'x'.repeat(44),
      KEYCLOAK_CLIENT_ID: 'user-portal',
      KEYCLOAK_CLIENT_SECRET: 'secret',
      KEYCLOAK_ADMIN_API_CLIENT_SECRET: 'secret2',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.missing).toContain('REDIS_URL')
  })
})

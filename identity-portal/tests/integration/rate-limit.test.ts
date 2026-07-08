import Redis from 'ioredis'
import { afterAll, describe, expect, it } from 'vitest'
import { checkRateLimit, hashDim, rateLimitKey } from '@/lib/rate-limit/sliding-window'

const redis = new Redis(process.env.REDIS_URL ?? 'redis://:identity-dev-redis@localhost:16379')

afterAll(async () => {
  await redis.quit()
})

describe('rate-limit 滑动窗口(真实 Redis)', () => {
  it('窗口内超过上限拒绝,窗口滑动后恢复', async () => {
    const key = rateLimitKey('test-login', hashDim(`user-${Date.now()}`))
    const rule = { windowMs: 800, max: 3 }

    for (let i = 0; i < 3; i++) {
      expect((await checkRateLimit(redis, key, rule)).allowed).toBe(true)
    }
    expect((await checkRateLimit(redis, key, rule)).allowed).toBe(false)

    await new Promise((r) => setTimeout(r, 900))
    expect((await checkRateLimit(redis, key, rule)).allowed).toBe(true)
  })

  it('不同 key 互不影响', async () => {
    const rule = { windowMs: 10_000, max: 1 }
    const k1 = rateLimitKey('test-iso', 'a')
    const k2 = rateLimitKey('test-iso', 'b')
    expect((await checkRateLimit(redis, k1, rule)).allowed).toBe(true)
    expect((await checkRateLimit(redis, k1, rule)).allowed).toBe(false)
    expect((await checkRateLimit(redis, k2, rule)).allowed).toBe(true)
  })

  it('用户名维度哈希不出现明文', () => {
    const key = rateLimitKey('login', '1.2.3.4', hashDim('alice@example.com'))
    expect(key).not.toContain('alice@example.com')
    expect(key).toMatch(/^rate_limit:login:1\.2\.3\.4:[0-9a-f]{16}$/)
  })
})

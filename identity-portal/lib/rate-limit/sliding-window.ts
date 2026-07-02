import { createHash } from 'node:crypto'
import type Redis from 'ioredis'

export type RateLimitRule = {
  /** 窗口毫秒 */
  windowMs: number
  /** 窗口内最大次数 */
  max: number
}

export type RateLimitResult = {
  allowed: boolean
}

/**
 * Redis 滑动窗口(安全设计 §10.1):sorted set 存时间戳,原子清理+计数+写入。
 * 注意:结果不向终端用户暴露剩余次数(防枚举);key 中用户名一律哈希。
 */
export async function checkRateLimit(
  redis: Redis,
  key: string,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const now = Date.now()
  const windowStart = now - rule.windowMs
  const member = `${now}:${Math.random().toString(36).slice(2, 10)}`

  const results = await redis
    .multi()
    .zremrangebyscore(key, 0, windowStart)
    .zcard(key)
    .exec()
  if (!results) return { allowed: false }
  const current = Number(results[1][1] ?? 0)
  if (current >= rule.max) return { allowed: false }

  await redis
    .multi()
    .zadd(key, now, member)
    .pexpire(key, rule.windowMs)
    .exec()
  return { allowed: true }
}

/** 场景 key 构造:用户名等敏感维度哈希后入 key */
export function rateLimitKey(scene: string, ...dims: string[]): string {
  return `rate_limit:${scene}:${dims.join(':')}`
}

export function hashDim(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

/** 分层限制规则(安全设计) */
export const RATE_LIMIT_RULES = {
  login: { windowMs: 60_000, max: 5 },
  register: { windowMs: 3_600_000, max: 10 },
  forgotPassword: { windowMs: 3_600_000, max: 3 },
  adminApi: { windowMs: 60_000, max: 100 },
  webhook: { windowMs: 60_000, max: 60 },
} as const satisfies Record<string, RateLimitRule>

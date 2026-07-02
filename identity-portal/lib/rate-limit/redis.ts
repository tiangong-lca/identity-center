import Redis from 'ioredis'

let singleton: Redis | null = null

/** 共享 Redis 连接(速率限制/轻量缓存);BullMQ 任务队列使用独立连接(L3) */
export function getRedis(): Redis {
  if (!singleton) {
    const url = process.env.REDIS_URL
    if (!url) throw new Error('REDIS_URL 未配置')
    singleton = new Redis(url, { maxRetriesPerRequest: 2 })
  }
  return singleton
}

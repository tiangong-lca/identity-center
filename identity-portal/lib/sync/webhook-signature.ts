import { createHmac, timingSafeEqual } from 'node:crypto'

const TOLERANCE_SECONDS = 300

/** Webhook 签名(同步与事件设计 §6.2):sha256=base64(HMAC-SHA256(secret, timestamp + '.' + rawBody)) */
export function signWebhook(secret: string, timestamp: string, rawBody: string): string {
  const mac = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('base64')
  return `sha256=${mac}`
}

/** 业务应用端验证(平台侧也用于连通性测试):签名比对 + ±300s 时间窗 */
export function verifyWebhook(
  secret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): { valid: boolean; reason?: string } {
  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return { valid: false, reason: 'timestamp 非法' }
  if (Math.abs(nowSeconds - ts) > TOLERANCE_SECONDS) {
    return { valid: false, reason: 'timestamp 超出容忍窗口' }
  }
  const expected = signWebhook(secret, timestamp, rawBody)
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: '签名不匹配' }
  }
  return { valid: true }
}

/** Webhook 重试退避(1s/5s/30s/2min/10min,最多 5 次) */
export const WEBHOOK_RETRY_DELAYS_MS = [1_000, 5_000, 30_000, 120_000, 600_000] as const
export const WEBHOOK_MAX_ATTEMPTS = WEBHOOK_RETRY_DELAYS_MS.length

import { verifyWebhook } from '@/lib/sync/webhook-signature'

/**
 * 业务应用接入参考:验证来自平台的 Webhook。
 * 头:X-Webhook-Signature / X-Webhook-Timestamp / X-Webhook-Event-Id。
 * 接入方须对 eventId 做幂等去重(此处仅示范验签)。
 */
export function verifyPlatformWebhook(input: {
  secret: string
  signature: string
  timestamp: string
  rawBody: string
}): { valid: boolean; reason?: string } {
  return verifyWebhook(input.secret, input.timestamp, input.rawBody, input.signature)
}

export { verifyWebhook }

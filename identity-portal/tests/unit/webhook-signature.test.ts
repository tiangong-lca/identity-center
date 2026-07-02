import { describe, expect, it } from 'vitest'
import { signWebhook, verifyWebhook } from '@/lib/sync/webhook-signature'

describe('webhook 签名', () => {
  const secret = 'test-secret'
  const body = JSON.stringify({ eventId: 'evt_1', value: '中文' })

  it('签名/验证回环(raw body 语义)', () => {
    const ts = String(Math.floor(Date.now() / 1000))
    const sig = signWebhook(secret, ts, body)
    expect(sig).toMatch(/^sha256=/)
    expect(verifyWebhook(secret, ts, body, sig).valid).toBe(true)
  })

  it('超出 ±300s 时间窗拒绝(防重放)', () => {
    const old = String(Math.floor(Date.now() / 1000) - 400)
    const sig = signWebhook(secret, old, body)
    const r = verifyWebhook(secret, old, body, sig)
    expect(r.valid).toBe(false)
    expect(r.reason).toContain('容忍窗口')
  })

  it('body 或 secret 被篡改拒绝', () => {
    const ts = String(Math.floor(Date.now() / 1000))
    const sig = signWebhook(secret, ts, body)
    expect(verifyWebhook(secret, ts, body + 'x', sig).valid).toBe(false)
    expect(verifyWebhook('wrong', ts, body, sig).valid).toBe(false)
  })
})

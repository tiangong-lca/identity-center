import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createKeycloakAdmin } from '@/lib/keycloak/admin-client'
import { resolveAdminApiConfig } from './helpers/keycloak'

const MAILPIT_API = process.env.MAILPIT_API ?? 'http://localhost:8025'

/**
 * SMTP 链路验证:Keycloak 触发验证邮件 → Mailpit 实际收到。
 * 默认环境不发邮件(KC_VERIFY_EMAIL 关闭、无 SMTP),故此套件默认跳过;
 * 设 KC_SMTP_HOST(或 SMTP_TEST_ENABLED=1)启用邮件链路时运行,防"SMTP 配好却发不出"回归。
 */
const smtpEnabled = Boolean(process.env.KC_SMTP_HOST) || process.env.SMTP_TEST_ENABLED === '1'

describe.skipIf(!smtpEnabled)('Keycloak 邮件发送链路(真实 KC + Mailpit)', () => {
  let admin: ReturnType<typeof createKeycloakAdmin>
  let userId: string
  const email = `mail-${randomUUID().slice(0, 8)}@test.local`

  beforeAll(async () => {
    admin = createKeycloakAdmin(await resolveAdminApiConfig())
    userId = await admin.createUser({ email, emailVerified: false, enabled: true })
    // 清空 Mailpit,避免历史邮件干扰
    await fetch(`${MAILPIT_API}/api/v1/messages`, { method: 'DELETE' }).catch(() => {})
  })

  afterAll(async () => {
    if (userId) await admin.deleteUser(userId).catch(() => {})
  })

  it('触发验证邮件动作 → Mailpit 收到发往该地址的邮件', async () => {
    // 经 admin REST 发送 VERIFY_EMAIL 动作邮件(与登录时触发同一 SMTP 链路)
    await admin.raw.users.executeActionsEmail({ id: userId, actions: ['VERIFY_EMAIL'] })

    const message = await waitForMail(email)
    expect(message, `Mailpit 未收到发往 ${email} 的邮件(SMTP 链路不通)`).toBeTruthy()
  })
})

async function waitForMail(to: string, timeoutMs = 10_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${MAILPIT_API}/api/v1/search?query=${encodeURIComponent('to:' + to)}`).catch(
      () => null,
    )
    if (res?.ok) {
      const data = (await res.json()) as { messages?: Array<{ ID: string }> }
      if (data.messages && data.messages.length > 0) return data.messages[0]
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  return null
}

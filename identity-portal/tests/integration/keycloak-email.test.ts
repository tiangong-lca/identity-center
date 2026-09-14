import { randomUUID } from 'node:crypto'
import KcAdminClient from '@keycloak/keycloak-admin-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const BASE_URL = process.env.KEYCLOAK_BASE_URL ?? 'http://localhost:8080'
const MAILPIT_API = process.env.MAILPIT_API ?? 'http://localhost:8025'

/**
 * SMTP 链路验证:Keycloak 触发验证邮件 → Mailpit 实际收到。
 * 默认环境不发邮件(KC_VERIFY_EMAIL 关闭、无 SMTP),故此套件默认跳过;
 * 设 KC_SMTP_HOST(或 SMTP_TEST_ENABLED=1)启用邮件链路时运行,防"SMTP 配好却发不出"回归。
 *
 * 隔离契约(不触碰共享 Mailpit 邮箱与 company-dev realm):
 * - 启用时创建随机命名的 disposable realm(`email-proof-<uuid>`),SMTP 指向
 *   Keycloak 容器网络内的本地 Mailpit(mailpit:1025,测试 from);
 * - 仅创建本测试自己的随机用户并发送 VERIFY_EMAIL;
 * - 按"唯一收件人"检索邮件,绝不 DELETE /api/v1/messages 清空共享 Mailpit,
 *   绝不改共享 company-dev realm,不重跑共享 bootstrap;
 * - realm 创建成功才负责清理;清理失败必须使验证失败。
 * 前置安全门:Keycloak 与 Mailpit 地址必须是 loopback 本地测试地址。
 */
const smtpEnabled = Boolean(process.env.KC_SMTP_HOST) || process.env.SMTP_TEST_ENABLED === '1'

function assertLoopback(url: string, label: string): URL {
  const parsed = new URL(url)
  const host = parsed.hostname
  if (!(host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1')) {
    throw new Error(`${label} 必须是 loopback 本地测试地址,当前: ${url}`)
  }
  if (parsed.protocol !== 'http:') {
    throw new Error(`${label} 本地测试必须使用 http,当前: ${url}`)
  }
  return parsed
}

describe.skipIf(!smtpEnabled)('Keycloak 邮件发送链路(真实 KC + Mailpit,隔离 disposable realm)', () => {
  // loopback 安全门在任何创建动作之前执行
  const keycloakUrl = assertLoopback(BASE_URL, 'KEYCLOAK_BASE_URL')
  const mailpitUrl = assertLoopback(MAILPIT_API, 'MAILPIT_API')
  const smtpHostInNetwork = process.env.SMTP_HOST_IN_NETWORK ?? 'mailpit'
  const smtpFrom = process.env.SMTP_TEST_FROM ?? 'noreply@email-proof.test'
  const kc = new KcAdminClient({ baseUrl: keycloakUrl.toString(), realmName: 'master' })
  const testRealm = `email-proof-${randomUUID()}`
  const email = `mail-${randomUUID().slice(0, 8)}@test.local`
  let realmCreated = false
  let userId: string

  beforeAll(async () => {
    await kc.auth({
      username: process.env.KEYCLOAK_ADMIN_USERNAME ?? 'admin',
      password: process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin',
      grantType: 'password',
      clientId: 'admin-cli',
    })
    await kc.realms.create({
      realm: testRealm,
      enabled: true,
      registrationAllowed: false,
      verifyEmail: true,
      smtpServer: {
        host: smtpHostInNetwork,
        port: '1025',
        from: smtpFrom,
        fromDisplayName: 'Identity Platform Email Proof',
      },
    })
    realmCreated = true
    kc.setConfig({ realmName: testRealm })
    const created = await kc.users.create({
      username: email,
      email,
      enabled: true,
      emailVerified: false,
    })
    userId = created.id
  })

  afterAll(async () => {
    // realm 创建成功才负责清理;清理错误必须使验证失败
    if (realmCreated) await kc.realms.del({ realm: testRealm })
  })

  it('触发验证邮件动作 → Mailpit 按唯一收件人收到该用户的验证邮件', async () => {
    const mailpitHref = mailpitUrl.toString()
    await kc.users.executeActionsEmail({ id: userId, actions: ['VERIFY_EMAIL'] })

    const message = await waitForMail(email)
    expect(message, `Mailpit 未收到发往 ${email} 的邮件(SMTP 链路不通)`).toBeTruthy()
    const detail = await fetch(`${mailpitHref}api/v1/message/${message!.ID}`)
    expect(detail.ok, 'Mailpit 邮件详情读取失败').toBe(true)
    const body = (await detail.json()) as { To?: Array<{ Address?: string }>, Subject?: string }
    const recipients = (body.To ?? []).map((t) => t.Address)
    expect(recipients).toContain(email)
  })
})

async function waitForMail(to: string, timeoutMs = 15_000) {
  const mailpitHref = assertLoopback(MAILPIT_API, 'MAILPIT_API').toString()
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${mailpitHref}api/v1/search?query=${encodeURIComponent('to:' + to)}`).catch(
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

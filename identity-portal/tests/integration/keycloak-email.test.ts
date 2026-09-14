import { randomUUID } from 'node:crypto'
import KcAdminClient from '@keycloak/keycloak-admin-client'
import { assert, afterAll, beforeAll, describe, expect, it } from 'vitest'

const BASE_URL = process.env.KEYCLOAK_BASE_URL ?? 'http://localhost:8080'
const MAILPIT_API = process.env.MAILPIT_API ?? 'http://localhost:8025'

/**
 * SMTP 链路验证:Keycloak 触发验证邮件 → Mailpit 实际收到。
 * 默认环境不发邮件(KC_VERIFY_EMAIL 关闭、无 SMTP),故此套件默认跳过;
 * 设 KC_SMTP_HOST 或 SMTP_TEST_ENABLED=1 启用邮件链路验证。
 *
 * 隔离契约(不触碰共享 Mailpit 邮箱与 company-dev realm):
 * - 启用时创建随机命名的 disposable realm(`email-proof-<uuid>`),SMTP 固定指向
 *   Keycloak 容器网络内的本地 Mailpit(mailpit:1025,固定测试 from),无任意
 *   远端 SMTP 出站配置入口;
 * - 仅创建本测试自己的随机用户并发送 VERIFY_EMAIL;
 * - 按"唯一收件人"检索邮件,绝不 DELETE /api/v1/messages 清空共享 Mailpit,
 *   绝不改共享 company-dev realm,不重跑共享 bootstrap;
 * - realm 创建成功才负责清理;清理失败必须使验证失败。
 * 前置安全门(beforeAll 内,跳过路径不受无关 URL 环境影响):Keycloak 与
 * Mailpit 地址必须是 loopback 本地测试地址;URL 的用户名/密码/query/hash
 * 一律拒绝,仅接受规范根路径。
 */
const smtpEnabled = Boolean(process.env.KC_SMTP_HOST) || process.env.SMTP_TEST_ENABLED === '1'

function assertLoopbackTestUrl(rawUrl: string, label: string): string {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error(`${label} 必须是有效的本地测试 URL`)
  }
  const host = parsed.hostname
  if (!(host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1')) {
    throw new Error(`${label} 必须是 loopback 本地测试地址(拒绝非本地主机)`)
  }
  if (parsed.protocol !== 'http:') {
    throw new Error(`${label} 本地测试必须使用 http`)
  }
  // 凭据/query/hash 一律拒绝;仅接受规范根路径(或空路径)
  if (parsed.username !== '' || parsed.password !== '' || parsed.search !== '' || parsed.hash !== '') {
    throw new Error(`${label} 不得包含用户名/密码/query/hash`)
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error(`${label} 仅接受根路径,不接受路径前缀`)
  }
  return parsed.origin
}

describe.skipIf(!smtpEnabled)('Keycloak 邮件发送链路(真实 KC + Mailpit,隔离 disposable realm)', () => {
  let kc: KcAdminClient
  const testRealm = `email-proof-${randomUUID()}`
  const email = `mail-${randomUUID().slice(0, 8)}@test.local`
  // 固定的本地 SMTP 目的地:Keycloak 容器网络内的 Mailpit;无远端配置入口
  const SMTP_HOST_IN_NETWORK = 'mailpit'
  const SMTP_PORT = '1025'
  const SMTP_FROM = 'noreply@email-proof.test'
  let keycloakBase = ''
  let mailpitBase = ''
  let realmCreated = false
  let userId: string

  beforeAll(async () => {
    // loopback 安全门在 beforeAll 内、任何 auth/create 之前执行
    keycloakBase = assertLoopbackTestUrl(BASE_URL, 'KEYCLOAK_BASE_URL')
    mailpitBase = assertLoopbackTestUrl(MAILPIT_API, 'MAILPIT_API')
    kc = new KcAdminClient({ baseUrl: keycloakBase, realmName: 'master' })
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
        host: SMTP_HOST_IN_NETWORK,
        port: SMTP_PORT,
        from: SMTP_FROM,
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
    await kc.users.executeActionsEmail({ id: userId, actions: ['VERIFY_EMAIL'] })

    const message = await waitForMail(email, mailpitBase)
    expect(message, `Mailpit 未收到发往 ${email} 的邮件(SMTP 链路不通)`).toBeTruthy()
    let detail: Response
    try {
      detail = await fetch(new URL(`/api/v1/message/${message!.ID}`, mailpitBase))
    } catch (error) {
      throw new Error(`Mailpit 详情读取传输失败: ${String(error)}`)
    }
    expect(detail.ok, 'Mailpit 邮件详情读取失败').toBe(true)
    const body = (await detail.json()) as { To?: Array<{ Address?: string }>, Subject?: string }
    const recipients = (body.To ?? []).map((t) => t.Address)
    expect(recipients).toContain(email)
  })
})

async function waitForMail(to: string, mailpitBase: string, timeoutMs = 15_000) {
  assert.ok(mailpitBase, 'Mailpit base URL must be provided by the suite')
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const url = new URL('/api/v1/search', mailpitBase)
    url.searchParams.set('query', `to:${to}`)
    let res: Response
    try {
      res = await fetch(url)
    } catch (error) {
      // 传输失败(网络/DNS/拒绝连接)不是"暂未收到",直接失败,不得伪装成轮询等待
      throw new Error(`Mailpit 查询传输失败: ${String(error)}`)
    }
    if (res.ok) {
      const data = (await res.json()) as { messages?: Array<{ ID: string }> }
      if (data.messages && data.messages.length > 0) return data.messages[0]
    } else {
      throw new Error(`Mailpit 查询服务错误: HTTP ${res.status}`)
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  return null
}

import { randomUUID } from 'node:crypto'
import KcAdminClient from '@keycloak/keycloak-admin-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { remediateEmailState } from '@/scripts/keycloak/remediate-email-state'

const BASE_URL = process.env.KEYCLOAK_BASE_URL ?? 'http://localhost:8080'

/**
 * D-003 存量修复回归:带 VERIFY_EMAIL required action / emailVerified=false 的历史用户,
 * sweep 后必须可正常走登录流(不再触发发邮件)。
 *
 * remediateEmailState 对其所在 realm 做"全量 sweep",且断言 second.patched===0 要求
 * sweep 范围内除本测试用户外无其他未验证用户。套件并行运行时其他文件会向共享 realm
 * 创建未验证用户,故本次测试使用随机命名的 disposable realm 全程隔离:
 * realm 仅由本测试创建与删除,脚本本身不做任何改动。
 */
describe('存量用户邮件状态修复(真实 Keycloak,隔离 realm)', () => {
  const kc = new KcAdminClient({ baseUrl: BASE_URL, realmName: 'master' })
  const testRealm = `remediate-it-${randomUUID()}`
  const email = `stale-${randomUUID().slice(0, 8)}@test.local`
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
      verifyEmail: false,
      registrationAllowed: false,
    })
    realmCreated = true
    kc.setConfig({ realmName: testRealm })
    // 制造"修复前"的存量状态:未验证邮箱 + 挂 VERIFY_EMAIL 动作
    const created = await kc.users.create({
      username: email,
      email,
      enabled: true,
      emailVerified: false,
      requiredActions: ['VERIFY_EMAIL'],
    })
    userId = created.id
  })

  afterAll(async () => {
    if (realmCreated) await kc.realms.del({ realm: testRealm })
  })

  it('sweep 后 emailVerified=true 且邮件依赖动作被剥离(幂等)', async () => {
    const first = await remediateEmailState(kc, () => {})
    expect(first.patched).toBeGreaterThanOrEqual(1)

    const user = await kc.users.findOne({ id: userId })
    expect(user?.emailVerified).toBe(true)
    expect(user?.requiredActions ?? []).not.toContain('VERIFY_EMAIL')

    // 幂等:再跑一遍,该用户不再被修复
    const second = await remediateEmailState(kc, () => {})
    expect(second.patched).toBe(0)
  })
})

import { randomUUID } from 'node:crypto'
import KcAdminClient from '@keycloak/keycloak-admin-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { remediateEmailState } from '@/scripts/keycloak/remediate-email-state'

const BASE_URL = process.env.KEYCLOAK_BASE_URL ?? 'http://localhost:8080'
const REALM = process.env.KEYCLOAK_REALM ?? 'company-dev'

/**
 * D-003 存量修复回归:带 VERIFY_EMAIL required action / emailVerified=false 的历史用户,
 * sweep 后必须可正常走登录流(不再触发发邮件)。
 */
describe('存量用户邮件状态修复(真实 Keycloak)', () => {
  const kc = new KcAdminClient({ baseUrl: BASE_URL, realmName: 'master' })
  const email = `stale-${randomUUID().slice(0, 8)}@test.local`
  let userId: string

  beforeAll(async () => {
    await kc.auth({
      username: process.env.KEYCLOAK_ADMIN_USERNAME ?? 'admin',
      password: process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin',
      grantType: 'password',
      clientId: 'admin-cli',
    })
    kc.setConfig({ realmName: REALM })
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
    if (userId) await kc.users.del({ id: userId }).catch(() => {})
  })

  it('sweep 后 emailVerified=true 且邮件依赖动作被剥离(幂等)', async () => {
    const first = await remediateEmailState(kc, () => {})
    expect(first.patched).toBeGreaterThanOrEqual(1)

    const after = await kc.users.findOne({ id: userId })
    expect(after?.emailVerified).toBe(true)
    expect(after?.requiredActions ?? []).not.toContain('VERIFY_EMAIL')

    // 幂等:再跑一遍,该用户不再被修复
    const second = await remediateEmailState(kc, () => {})
    expect(second.patched).toBe(0)
  })
})

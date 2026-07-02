import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createKeycloakAdmin, type KeycloakAdmin } from '@/lib/keycloak/admin-client'
import { resolveAdminApiConfig } from './helpers/keycloak'

describe('lib/keycloak admin-client(真实 Keycloak,service account 凭证)', () => {
  let admin: KeycloakAdmin
  let userId: string
  const email = `it-${randomUUID().slice(0, 8)}@test.local`

  beforeAll(async () => {
    admin = createKeycloakAdmin(await resolveAdminApiConfig())
  })

  afterAll(async () => {
    if (userId) await admin.deleteUser(userId).catch(() => {})
  })

  it('client_credentials 认证并创建用户', async () => {
    userId = await admin.createUser({
      email,
      displayName: '集成 测试',
      temporaryPassword: 'Temp-Pass-2026',
    })
    expect(userId).toBeTruthy()
    const user = await admin.getUser(userId)
    expect(user?.email).toBe(email)
    expect(user?.enabled).toBe(true)
  })

  it('禁用 → 会话登出 → 启用', async () => {
    await admin.setUserEnabled(userId, false)
    expect((await admin.getUser(userId))?.enabled).toBe(false)
    await admin.logoutUserSessions(userId)
    await admin.setUserEnabled(userId, true)
    expect((await admin.getUser(userId))?.enabled).toBe(true)
  })

  it('Client Role 授予/查询/移除(准入投影原语)', async () => {
    const portal = await admin.findClientByClientId('user-portal')
    expect(portal?.id).toBeTruthy()
    const clientUniqueId = portal!.id!

    await admin.ensureClientRole(clientUniqueId, 'it_test_access')
    await admin.grantClientRole(userId, clientUniqueId, 'it_test_access')
    let roles = await admin.listUserClientRoles(userId, clientUniqueId)
    expect(roles.some((r) => r.name === 'it_test_access')).toBe(true)

    await admin.revokeClientRole(userId, clientUniqueId, 'it_test_access')
    roles = await admin.listUserClientRoles(userId, clientUniqueId)
    expect(roles.some((r) => r.name === 'it_test_access')).toBe(false)
  })

  it('重置密码与 MFA 原语不抛错', async () => {
    await admin.resetPassword(userId, 'Another-Temp-2026')
    await admin.resetMfa(userId)
  })

  it('错误映射:操作不存在用户 → USER_NOT_FOUND', async () => {
    await expect(admin.setUserEnabled(randomUUID(), false)).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    })
  })
})

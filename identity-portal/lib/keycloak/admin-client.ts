import KcAdminClient from '@keycloak/keycloak-admin-client'
import { toApiError } from './errors'

export type KeycloakConfig = {
  baseUrl: string
  realm: string
  clientId: string
  clientSecret: string
}

export function keycloakConfigFromEnv(): KeycloakConfig {
  const baseUrl = process.env.KEYCLOAK_BASE_URL
  const realm = process.env.KEYCLOAK_REALM
  const clientId = process.env.KEYCLOAK_ADMIN_API_CLIENT_ID ?? 'user-portal-admin-api'
  const clientSecret = process.env.KEYCLOAK_ADMIN_API_CLIENT_SECRET
  if (!baseUrl || !realm || !clientSecret) {
    throw new Error('KEYCLOAK_BASE_URL / KEYCLOAK_REALM / KEYCLOAK_ADMIN_API_CLIENT_SECRET 未配置')
  }
  return { baseUrl, realm, clientId, clientSecret }
}

/** service account 凭证的 Keycloak 管理客户端,token 过期前自动重认证 */
export function createKeycloakAdmin(cfg: KeycloakConfig) {
  const kc = new KcAdminClient({ baseUrl: cfg.baseUrl, realmName: cfg.realm })
  let expiresAt = 0

  async function ensureAuth() {
    if (Date.now() < expiresAt - 10_000) return
    try {
      await kc.auth({
        grantType: 'client_credentials',
        clientId: cfg.clientId,
        clientSecret: cfg.clientSecret,
      })
    } catch (e) {
      throw toApiError(e, 'Keycloak 认证')
    }
    // access token 默认 60s~300s;从 token 解析 exp
    const token = kc.accessToken
    if (token) {
      const [, payload] = token.split('.')
      try {
        const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { exp: number }
        expiresAt = exp * 1000
      } catch {
        expiresAt = Date.now() + 30_000
      }
    }
  }

  return {
    /** 暴露原始 client(高级用法);调用方需先 await ready() */
    raw: kc,
    ready: ensureAuth,

    async findUserByEmail(email: string) {
      await ensureAuth()
      const users = await kc.users.find({ email, exact: true })
      return users[0]
    },

    async getUser(userId: string) {
      await ensureAuth()
      try {
        return await kc.users.findOne({ id: userId })
      } catch (e) {
        throw toApiError(e, '查询用户')
      }
    },

    async createUser(input: {
      email: string
      displayName?: string
      temporaryPassword?: string
      enabled?: boolean
      emailVerified?: boolean
    }) {
      await ensureAuth()
      try {
        const [firstName, ...rest] = (input.displayName ?? '').split(' ')
        const { id } = await kc.users.create({
          username: input.email,
          email: input.email,
          firstName: firstName || undefined,
          lastName: rest.join(' ') || undefined,
          enabled: input.enabled ?? true,
          emailVerified: input.emailVerified ?? false,
          credentials: input.temporaryPassword
            ? [{ type: 'password', value: input.temporaryPassword, temporary: true }]
            : undefined,
        })
        return id
      } catch (e) {
        throw toApiError(e, '创建用户')
      }
    },

    async setUserEnabled(userId: string, enabled: boolean) {
      await ensureAuth()
      try {
        await kc.users.update({ id: userId }, { enabled })
      } catch (e) {
        throw toApiError(e, enabled ? '启用用户' : '禁用用户')
      }
    },

    async logoutUserSessions(userId: string) {
      await ensureAuth()
      try {
        await kc.users.logout({ id: userId })
      } catch (e) {
        throw toApiError(e, '登出用户会话')
      }
    },

    async resetPassword(userId: string, temporaryPassword: string) {
      await ensureAuth()
      try {
        await kc.users.resetPassword({
          id: userId,
          credential: { type: 'password', value: temporaryPassword, temporary: true },
        })
      } catch (e) {
        throw toApiError(e, '重置密码')
      }
    },

    async resetMfa(userId: string) {
      await ensureAuth()
      try {
        const credentials = await kc.users.getCredentials({ id: userId })
        for (const cred of credentials) {
          if (cred.type === 'otp' && cred.id) {
            await kc.users.deleteCredential({ id: userId, credentialId: cred.id })
          }
        }
      } catch (e) {
        throw toApiError(e, '重置 MFA')
      }
    },

    async findClientByClientId(clientId: string) {
      await ensureAuth()
      const clients = await kc.clients.find({ clientId })
      return clients[0]
    },

    /** 确保 client 上存在指定 client role,返回角色 */
    async ensureClientRole(clientUniqueId: string, roleName: string) {
      await ensureAuth()
      try {
        const existing = await kc.clients
          .findRole({ id: clientUniqueId, roleName })
          .catch(() => null)
        if (existing) return existing
        await kc.clients.createRole({ id: clientUniqueId, name: roleName })
        return await kc.clients.findRole({ id: clientUniqueId, roleName })
      } catch (e) {
        throw toApiError(e, '确保 Client Role')
      }
    },

    async grantClientRole(userId: string, clientUniqueId: string, roleName: string) {
      await ensureAuth()
      try {
        const role = await kc.clients.findRole({ id: clientUniqueId, roleName })
        if (!role?.id || !role.name) throw new Error(`client role ${roleName} 不存在`)
        await kc.users.addClientRoleMappings({
          id: userId,
          clientUniqueId,
          roles: [{ id: role.id, name: role.name }],
        })
      } catch (e) {
        throw toApiError(e, '授予 Client Role')
      }
    },

    async revokeClientRole(userId: string, clientUniqueId: string, roleName: string) {
      await ensureAuth()
      try {
        const role = await kc.clients.findRole({ id: clientUniqueId, roleName })
        if (!role?.id || !role.name) return
        await kc.users.delClientRoleMappings({
          id: userId,
          clientUniqueId,
          roles: [{ id: role.id, name: role.name }],
        })
      } catch (e) {
        throw toApiError(e, '移除 Client Role')
      }
    },

    async listUserClientRoles(userId: string, clientUniqueId: string) {
      await ensureAuth()
      try {
        return await kc.users.listClientRoleMappings({ id: userId, clientUniqueId })
      } catch (e) {
        throw toApiError(e, '查询用户 Client Role')
      }
    },

    async listUserSessions(userId: string) {
      await ensureAuth()
      try {
        return await kc.users.listSessions({ id: userId })
      } catch (e) {
        throw toApiError(e, '查询用户会话')
      }
    },

    async deleteUser(userId: string) {
      await ensureAuth()
      try {
        await kc.users.del({ id: userId })
      } catch (e) {
        throw toApiError(e, '删除用户')
      }
    },
  }
}

export type KeycloakAdmin = ReturnType<typeof createKeycloakAdmin>

let singleton: KeycloakAdmin | null = null

export function getKeycloakAdmin(): KeycloakAdmin {
  if (!singleton) singleton = createKeycloakAdmin(keycloakConfigFromEnv())
  return singleton
}

import type { NextAuthConfig } from 'next-auth'
import Keycloak from 'next-auth/providers/keycloak'
import { terminateKeycloakSession } from './end-session'
import { getRedis } from '@/lib/rate-limit/redis'

const BASE_URL = process.env.KEYCLOAK_BASE_URL ?? 'http://localhost:8080'
const REALM = process.env.KEYCLOAK_REALM ?? 'company-dev'

export const ADMIN_CONSOLE_ROLE = 'admin_console_access'

/** 从 Keycloak access token 中解析 realm roles(不校验签名——token 来自受信 token endpoint 直连响应) */
function parseRealmRoles(accessToken?: string): string[] {
  if (!accessToken) return []
  try {
    const [, payload] = accessToken.split('.')
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      realm_access?: { roles?: string[] }
    }
    return claims.realm_access?.roles ?? []
  } catch {
    return []
  }
}

export const authConfig: NextAuthConfig = {
  trustHost: true,
  providers: [
    Keycloak({
      issuer: `${BASE_URL}/realms/${REALM}`,
      clientId: process.env.KEYCLOAK_CLIENT_ID ?? 'user-portal',
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
      authorization: { params: { scope: 'openid email profile' } },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  events: {
    /** 登出第二层:终止 Keycloak SSO 会话,避免下次登录免密直入 */
    async signOut(message) {
      const idToken = 'token' in message ? message.token?.idToken : undefined
      await terminateKeycloakSession(idToken)
    },
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.keycloakSub = (profile?.sub as string) ?? token.sub
        token.roles = parseRealmRoles(account.access_token)
        token.idToken = account.id_token
        // 新登录:清除可能残留的历史吊销标记(上一次 backchannel logout 的遗留)
        const sub = token.keycloakSub
        if (sub) {
          await getRedis().del(`oidc:revoked:${sub}`)
        }
        return token
      }
      // 会话轮询:检查 Keycloak 是否已通过 backchannel logout 吊销该会话
      const keycloakSub = token.keycloakSub
      if (keycloakSub) {
        const revoked = await getRedis().exists(`oidc:revoked:${keycloakSub}`)
        if (revoked) {
          return null
        }
      }
      return token
    },
    session({ session, token }) {
      session.user.keycloakSub = token.keycloakSub ?? token.sub ?? ''
      session.user.roles = token.roles ?? []
      session.user.isAdmin = (token.roles ?? []).includes(ADMIN_CONSOLE_ROLE)
      return session
    },
  },
}

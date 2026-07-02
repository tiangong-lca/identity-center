import type { DefaultSession } from 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      /** Keycloak token sub,跨系统身份键 */
      keycloakSub: string
      /** Keycloak realm roles(如 admin_console_access) */
      roles: string[]
      /** 是否可进入管理后台(admin_console_access) */
      isAdmin: boolean
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    keycloakSub?: string
    roles?: string[]
    idToken?: string
  }
}

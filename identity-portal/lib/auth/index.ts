import NextAuth from 'next-auth'
import { authConfig } from './auth-config'

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
export { ADMIN_CONSOLE_ROLE } from './auth-config'

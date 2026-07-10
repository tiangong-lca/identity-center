'use server'

import { cookies } from 'next/headers'
import { signIn, signOut } from './index'

/**
 * 登出并重定向到 Keycloak 登录页。
 *
 * 必须先删除 next-auth.callback-url cookie:admin 在 /admin 页面登出时,
 * 该 cookie 可能记录了 /admin 路径;如果不清除,切账号登录后 Auth.js 会
 * 把新用户重定向回 /admin,触发 403。
 */
export async function logoutAndRedirectToKeycloak() {
  await signOut({ redirect: false })
  const c = await cookies()
  c.delete('next-auth.callback-url')
  await signIn('keycloak', { redirectTo: '/' })
}

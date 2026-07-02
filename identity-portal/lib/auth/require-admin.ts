import { ApiError } from '@/lib/http/api-error'
import { auth } from './index'

export type AdminSession = {
  keycloakSub: string
  email?: string | null
  roles: string[]
}

/**
 * 管理接口入口校验(三层校验的第一层):
 * 未登录 → UNAUTHENTICATED;无 admin_console_access → FORBIDDEN。
 * 细粒度 permission/scope 校验由 server/policies(L3)承担。
 */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await auth()
  if (!session?.user?.keycloakSub) {
    throw new ApiError('UNAUTHENTICATED', '未登录')
  }
  if (!session.user.isAdmin) {
    throw new ApiError('FORBIDDEN', '无管理后台访问权限')
  }
  return {
    keycloakSub: session.user.keycloakSub,
    email: session.user.email,
    roles: session.user.roles,
  }
}

import { ApiError } from '@/lib/http/api-error'

/**
 * Keycloak 不可用降级(安全设计 §15.1 管理侧):
 * 健康探测失败时,管理写操作返回 503,防止身份源离线时执行不可逆操作;
 * 读操作可基于本地数据继续。仅拒绝、不放行。
 */
export async function assertKeycloakAvailableForWrite(
  healthCheck: () => Promise<boolean>,
): Promise<void> {
  const ok = await healthCheck().catch(() => false)
  if (!ok) {
    throw new ApiError('DEPENDENCY_FAILED', '身份服务暂时不可用,管理写操作已暂停', {
      degraded: true,
    })
  }
}

/** 探测 Keycloak issuer discovery 可达性 */
export async function keycloakHealthy(baseUrl: string, realm: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/realms/${realm}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(3000),
    })
    return res.ok
  } catch {
    return false
  }
}

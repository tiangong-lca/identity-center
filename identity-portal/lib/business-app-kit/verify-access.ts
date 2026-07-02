/**
 * 业务应用接入参考实现(供接入方复制,平台侧不依赖):
 * 校验 Keycloak access token 的 resource_access[clientId].roles 是否含准入角色。
 * 契约(总体架构 §12):缺角色 → 403 APP_ACCESS_DENIED;无有效 token → 401 UNAUTHENTICATED。
 */
export type AccessCheck =
  | { allowed: true }
  | { allowed: false; code: 'UNAUTHENTICATED' | 'APP_ACCESS_DENIED'; reason: string }

type ResourceAccessClaims = {
  resource_access?: Record<string, { roles?: string[] }>
}

/** 解析 JWT payload(接入方应先验签;此处仅解码,签名校验由网关/中间件完成) */
export function decodeJwtPayload(token: string): ResourceAccessClaims | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as ResourceAccessClaims
  } catch {
    return null
  }
}

export function checkApplicationAccess(
  token: string | undefined,
  clientId: string,
  accessRole: string,
): AccessCheck {
  if (!token) return { allowed: false, code: 'UNAUTHENTICATED', reason: '缺少 access token' }
  const claims = decodeJwtPayload(token)
  if (!claims) return { allowed: false, code: 'UNAUTHENTICATED', reason: 'token 无法解析' }
  const roles = claims.resource_access?.[clientId]?.roles ?? []
  if (!roles.includes(accessRole)) {
    return { allowed: false, code: 'APP_ACCESS_DENIED', reason: `缺少准入角色 ${accessRole}` }
  }
  return { allowed: true }
}

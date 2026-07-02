const BASE_URL = process.env.KEYCLOAK_BASE_URL ?? 'http://localhost:8080'
const REALM = process.env.KEYCLOAK_REALM ?? 'company-dev'

/**
 * 构造 Keycloak OIDC end-session(RP-Initiated Logout)URL。
 * 带 id_token_hint 时 Keycloak 直接终止对应 user session(不依赖浏览器 cookie),
 * 这是"两层登出"的第二层(设计 §登出流程):清 Next.js 会话 + 终止 Keycloak SSO 会话。
 */
export function buildEndSessionUrl(idToken?: string, postLogoutRedirectUri?: string): string {
  const url = new URL(`${BASE_URL}/realms/${REALM}/protocol/openid-connect/logout`)
  if (idToken) url.searchParams.set('id_token_hint', idToken)
  if (postLogoutRedirectUri) {
    url.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri)
  }
  return url.toString()
}

/** 后端调用 end-session 终止 Keycloak 服务端会话(fire-and-forget,失败不阻断本地登出) */
export async function terminateKeycloakSession(idToken?: string): Promise<void> {
  if (!idToken) return
  try {
    await fetch(buildEndSessionUrl(idToken), { method: 'GET', signal: AbortSignal.timeout(3000) })
  } catch {
    // 终止失败不阻断本地登出;access token TTL + 会话过期兜底
  }
}

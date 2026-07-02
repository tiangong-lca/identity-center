/**
 * 验证码校验(安全设计 §速率限制:Turnstile / hCaptcha 可配置开关)。
 * 未配置 CAPTCHA_PROVIDER → 开发直通(返回 true);生产配置后强制校验。
 */
type CaptchaProvider = 'turnstile' | 'hcaptcha'

const VERIFY_URL: Record<CaptchaProvider, string> = {
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  hcaptcha: 'https://api.hcaptcha.com/siteverify',
}

export function captchaEnabled(): boolean {
  return Boolean(process.env.CAPTCHA_PROVIDER && process.env.CAPTCHA_SECRET)
}

export async function verifyCaptcha(token: string | undefined): Promise<boolean> {
  if (!captchaEnabled()) return true // 开发/未启用:直通
  if (!token) return false
  const provider = process.env.CAPTCHA_PROVIDER as CaptchaProvider
  const secret = process.env.CAPTCHA_SECRET as string
  try {
    const res = await fetch(VERIFY_URL[provider], {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(5000),
    })
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch {
    return false
  }
}

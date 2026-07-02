import { afterEach, describe, expect, it } from 'vitest'
import { captchaEnabled, verifyCaptcha } from '@/lib/security/captcha'

describe('captcha 开关', () => {
  const prev = { p: process.env.CAPTCHA_PROVIDER, s: process.env.CAPTCHA_SECRET }
  afterEach(() => {
    process.env.CAPTCHA_PROVIDER = prev.p
    process.env.CAPTCHA_SECRET = prev.s
  })

  it('未配置时直通(开发)', async () => {
    delete process.env.CAPTCHA_PROVIDER
    delete process.env.CAPTCHA_SECRET
    expect(captchaEnabled()).toBe(false)
    expect(await verifyCaptcha(undefined)).toBe(true)
  })

  it('已配置但缺 token → 拒绝', async () => {
    process.env.CAPTCHA_PROVIDER = 'turnstile'
    process.env.CAPTCHA_SECRET = 'secret'
    expect(captchaEnabled()).toBe(true)
    expect(await verifyCaptcha(undefined)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { defaultEmailVerified, emailVerificationEnabled } from '@/lib/config/email'
import { buildRealmRepresentation } from '@/scripts/keycloak/realm-config'

describe('realm 配置(邮箱验证默认关 / SMTP 可选)', () => {
  it('默认不要求邮箱验证且不配置 SMTP(无需邮件)', () => {
    const rep = buildRealmRepresentation({ realm: 'company-dev', verifyEmail: false })
    expect(rep.verifyEmail).toBe(false)
    expect(rep.smtpServer).toEqual({}) // 空对象 = Keycloak 视为未配置,不发邮件
  })

  it('无 SMTP 时自助找回密码必须关闭(点击即发邮件,必然失败)', () => {
    const rep = buildRealmRepresentation({ realm: 'company-dev', verifyEmail: false })
    expect(rep.resetPasswordAllowed).toBe(false)
  })

  it('配置 SMTP 后自助找回密码开启', () => {
    const rep = buildRealmRepresentation({ realm: 'company-dev', verifyEmail: true, smtpHost: 'mailpit' })
    expect(rep.resetPasswordAllowed).toBe(true)
  })

  it('开启验证并提供 SMTP host 时配置 smtpServer', () => {
    const rep = buildRealmRepresentation({
      realm: 'company-dev',
      verifyEmail: true,
      smtpHost: 'mailpit',
    })
    expect(rep.verifyEmail).toBe(true)
    expect(rep.smtpServer).toMatchObject({ host: 'mailpit', port: '1025' })
  })

  it('始终关闭 KC 自助注册(注册走门户审批)', () => {
    const rep = buildRealmRepresentation({ realm: 'company-dev', verifyEmail: false })
    expect(rep.registrationAllowed).toBe(false)
  })
})

describe('邮箱验证开关', () => {
  it('KC_VERIFY_EMAIL 缺省 → 关闭,开通账号默认已验证', () => {
    expect(emailVerificationEnabled({} as NodeJS.ProcessEnv)).toBe(false)
    expect(defaultEmailVerified({} as NodeJS.ProcessEnv)).toBe(true)
  })

  it('KC_VERIFY_EMAIL=true → 开启,开通账号需验证', () => {
    const env = { KC_VERIFY_EMAIL: 'true' } as unknown as NodeJS.ProcessEnv
    expect(emailVerificationEnabled(env)).toBe(true)
    expect(defaultEmailVerified(env)).toBe(false)
  })
})

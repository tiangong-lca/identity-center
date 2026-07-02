/** Keycloak realm 表示构造(纯函数,便于单测回归)。 */

export type RealmConfigInput = {
  realm: string
  /** 是否要求邮箱验证(默认环境为 false) */
  verifyEmail: boolean
  /** SMTP 主机(Keycloak 容器解析);未提供则不配置 SMTP */
  smtpHost?: string
  smtpPort?: string
  smtpFrom?: string
}

export type SmtpServer = {
  host: string
  port: string
  from: string
  fromDisplayName: string
}

export type RealmRepresentation = {
  realm: string
  enabled: true
  displayName: string
  registrationAllowed: false
  registrationEmailAsUsername: true
  verifyEmail: boolean
  /** 自助找回密码依赖邮件外发:未配置 SMTP 时必须关闭(否则点击即"无法发送邮件"),由管理员重置兜底 */
  resetPasswordAllowed: boolean
  rememberMe: false
  loginWithEmailAllowed: true
  duplicateEmailsAllowed: false
  bruteForceProtected: true
  failureFactor: number
  passwordPolicy: string
  internationalizationEnabled: true
  supportedLocales: string[]
  defaultLocale: string
  loginTheme: string
  /** SMTP 可选:未配置时为空对象(清除历史配置,Keycloak 视为未配置,不发邮件) */
  smtpServer: SmtpServer | Record<string, never>
}

export function buildRealmRepresentation(input: RealmConfigInput): RealmRepresentation {
  const smtpServer: SmtpServer | Record<string, never> = input.smtpHost
    ? {
        // host 由 Keycloak 容器解析,须用容器网络可达地址(compose 服务名 mailpit),
        // 不能用 localhost(容器内 localhost 指向 Keycloak 自身)。
        host: input.smtpHost,
        port: input.smtpPort ?? '1025',
        from: input.smtpFrom ?? 'noreply@identity.local',
        fromDisplayName: 'Identity Platform',
      }
    : {}

  return {
    realm: input.realm,
    enabled: true,
    displayName: 'Identity Platform',
    // 设计原则:注册默认需管理员审批 —— 关闭 KC 自助注册,统一走门户 /register 申请 → 审批 → 开通
    registrationAllowed: false,
    registrationEmailAsUsername: true,
    verifyEmail: input.verifyEmail,
    resetPasswordAllowed: Boolean(input.smtpHost),
    rememberMe: false,
    loginWithEmailAllowed: true,
    duplicateEmailsAllowed: false,
    bruteForceProtected: true,
    failureFactor: 5,
    passwordPolicy: 'length(10) and notUsername(undefined) and notEmail(undefined)',
    internationalizationEnabled: true,
    supportedLocales: ['zh-CN', 'en'],
    defaultLocale: 'zh-CN',
    loginTheme: 'identity',
    smtpServer,
  }
}

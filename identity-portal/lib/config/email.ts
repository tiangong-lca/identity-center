/**
 * 邮箱验证开关。
 * 默认关闭:当前环境无需 SMTP、不发送验证邮件,开通账号即视为已验证。
 * 设 KC_VERIFY_EMAIL=true 开启(此时须配置 KC_SMTP_HOST 指向容器可达的 SMTP 服务)。
 */
export function emailVerificationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.KC_VERIFY_EMAIL === 'true'
}

/** 新建用户时的 emailVerified 取值:不要求验证时直接标记已验证,避免登录被验证流程拦截 */
export function defaultEmailVerified(env: NodeJS.ProcessEnv = process.env): boolean {
  return !emailVerificationEnabled(env)
}

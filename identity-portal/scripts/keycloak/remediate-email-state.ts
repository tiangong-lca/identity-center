import type KcAdminClient from '@keycloak/keycloak-admin-client'

/** 邮件关闭模式下需要从用户身上剥离的邮件依赖动作 */
const EMAIL_DEPENDENT_ACTIONS = ['VERIFY_EMAIL', 'UPDATE_EMAIL']

/**
 * 存量用户邮件状态修复(D-003):
 * realm 关闭 verifyEmail 只影响"新登录是否追加验证动作",历史用户身上已挂的
 * VERIFY_EMAIL required action 仍会执行并因无 SMTP 而失败("无法发送邮件")。
 * 本函数将存量用户统一为:emailVerified=true,并剥离邮件依赖的 required actions。
 * 幂等;仅在邮箱验证关闭时调用。
 */
export async function remediateEmailState(
  kc: KcAdminClient,
  log: (msg: string) => void = console.log,
): Promise<{ patched: number }> {
  let patched = 0
  let first = 0
  const pageSize = 100
  for (;;) {
    const users = await kc.users.find({ first, max: pageSize })
    if (users.length === 0) break
    for (const user of users) {
      const staleActions = (user.requiredActions ?? []).filter((a) =>
        EMAIL_DEPENDENT_ACTIONS.includes(a),
      )
      const needsVerify = user.emailVerified !== true
      if (!needsVerify && staleActions.length === 0) continue
      await kc.users.update(
        { id: user.id as string },
        {
          ...user,
          emailVerified: true,
          requiredActions: (user.requiredActions ?? []).filter(
            (a) => !EMAIL_DEPENDENT_ACTIONS.includes(a),
          ),
        },
      )
      patched += 1
      log(
        `修复用户 ${user.email ?? user.username}:emailVerified=true${staleActions.length ? `,移除 ${staleActions.join('/')}` : ''}`,
      )
    }
    if (users.length < pageSize) break
    first += pageSize
  }
  return { patched }
}

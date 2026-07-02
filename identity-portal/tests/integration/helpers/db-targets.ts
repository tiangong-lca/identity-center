/**
 * 双库测试矩阵目标(decisions.md D-001):
 * - pg:常规必跑
 * - kes:KES_ENABLED=1 且 KINGBASE_ADMIN_URL 配置时加入(环境可得后一键补验)
 */
export type DbTarget = {
  name: 'pg' | 'kes'
  /** 具备建库权限的管理连接串 */
  adminUrl: string
}

export function getDbTargets(): DbTarget[] {
  const targets: DbTarget[] = [
    {
      name: 'pg',
      adminUrl:
        process.env.PG_ADMIN_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres',
    },
  ]
  if (process.env.KES_ENABLED === '1') {
    targets.push({
      name: 'kes',
      adminUrl:
        process.env.KINGBASE_ADMIN_URL ??
        'postgres://kingbase:kingbase@localhost:54321/test',
    })
  }
  return targets
}

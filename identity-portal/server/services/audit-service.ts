import {
  createAuditLogRepository,
  type ListAuditLogsParams,
} from '@/server/repositories/audit-log-repository'
import type { ServiceContext } from './context'

/** 审计查询服务(只读;写入由各业务服务经 repository 完成) */
export function createAuditService(ctx: ServiceContext) {
  const repo = createAuditLogRepository(ctx.db)
  return {
    list: (params: ListAuditLogsParams) => repo.list(params),
  }
}

export type AuditService = ReturnType<typeof createAuditService>

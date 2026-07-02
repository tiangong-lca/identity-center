import type { DrizzleDb } from '@/lib/db/client'
import type { KeycloakAdmin } from '@/lib/keycloak/admin-client'
import type { MqAdapter } from '@/lib/mq/types'

/** 任务依赖注入上下文(纯函数任务,BullMQ 只做调度接线) */
export type JobContext = {
  db: DrizzleDb
  mq: MqAdapter
  keycloak: KeycloakAdmin
  /** 可注入的 fetch(webhook 投递用,测试可替换) */
  fetchImpl?: typeof fetch
}

export type JobResult = {
  processed: number
  failed: number
  details?: Record<string, unknown>
}

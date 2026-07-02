import { AsyncLocalStorage } from 'node:async_hooks'
import { newOperationId, newRequestId, newTraceId } from '@/lib/http/request-id'

export type AuditActor = {
  keycloakSub: string
  email?: string
  ip?: string
  userAgent?: string
}

export type AuditContext = {
  requestId: string
  traceId: string
  operationId: string
  actor?: AuditActor
}

const storage = new AsyncLocalStorage<AuditContext>()

export function newAuditContext(partial: Partial<AuditContext> = {}): AuditContext {
  return {
    requestId: partial.requestId ?? newRequestId(),
    traceId: partial.traceId ?? newTraceId(),
    operationId: partial.operationId ?? newOperationId(),
    actor: partial.actor,
  }
}

export function runWithAuditContext<T>(ctx: AuditContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn)
}

export function getAuditContext(): AuditContext | undefined {
  return storage.getStore()
}

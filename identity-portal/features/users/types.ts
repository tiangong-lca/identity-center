/** 用户管理前端类型(与 API JSON 信封中的 data 字段对齐;时间为 ISO 字符串) */

export type PortalUserStatus = 'active' | 'disabled' | 'pending_deprovision' | 'deleted'

export type UserSyncStatus = 'in_sync' | 'pending' | 'failed'

export type PortalUser = {
  id: string
  keycloakSub: string
  keycloakUserId: string | null
  email: string
  displayName: string | null
  status: PortalUserStatus
  syncStatus: UserSyncStatus
  createdAt: string
  updatedAt: string
}

export type CreateUserInput = {
  email: string
  displayName?: string
  temporaryPassword: string
}

export type AdminApplication = {
  id: string
  code: string
  name: string
  status: string
}

export type AuditLogEntry = {
  id: string
  actorKeycloakSub: string
  actorEmail: string | null
  action: string
  targetType: string
  targetId: string
  result: 'success' | 'failure'
  failureReason: string | null
  createdAt: string
}

export type AssignmentGrantResult = {
  assignment: {
    id: string
    applicationId: string
    portalUserId: string
    status: string
    projectionStatus: string
  }
  /** projected=Keycloak 投影已完成(201);pending=最终一致同步中(202) */
  projection: 'projected' | 'pending'
}

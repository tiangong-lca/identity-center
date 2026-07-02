/** 平台事件类型(同步与事件设计 §事件清单,12 类) */
export const EVENT_TYPES = {
  USER_CREATED: 'identity.user.created',
  USER_UPDATED: 'identity.user.updated',
  USER_DISABLED: 'identity.user.disabled',
  USER_ENABLED: 'identity.user.enabled',
  USER_DELETED: 'identity.user.deleted',
  USER_LOGOUT: 'identity.user.logout',
  ACCESS_GRANTED: 'access.application.granted',
  ACCESS_REVOKED: 'access.application.revoked',
  ACCESS_EXPIRED: 'access.application.expired',
  ROLE_ASSIGNED: 'application.role.assigned',
  ROLE_REVOKED: 'application.role.revoked',
  ROLE_UPDATED: 'application.role.updated',
} as const

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES]

export const ALL_EVENT_TOPICS = Object.values(EVENT_TYPES)

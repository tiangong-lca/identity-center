'use client'

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import type { PortalUserStatus, UserSyncStatus } from '@/features/users/types'

const STATUS_STYLES: Record<PortalUserStatus, { dot: string; badge: string }> = {
  active: { dot: 'bg-success', badge: 'bg-success/10 text-success' },
  disabled: { dot: 'bg-muted-foreground', badge: 'bg-muted text-muted-foreground' },
  pending_deprovision: { dot: 'bg-warning', badge: 'bg-warning/10 text-warning' },
  deleted: { dot: 'bg-danger', badge: 'bg-danger/10 text-danger' },
}

/** 用户状态 Badge:active 绿 / disabled 灰(带状态圆点,对齐原型) */
export function UserStatusBadge({ status }: { status: PortalUserStatus }) {
  const t = useTranslations('users.status')
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.disabled
  return (
    <Badge className={style.badge}>
      <span aria-hidden className={`size-1.5 rounded-full ${style.dot}`} />
      {t(status in STATUS_STYLES ? status : 'disabled')}
    </Badge>
  )
}

const SYNC_STYLES: Record<UserSyncStatus, string> = {
  in_sync: 'text-success',
  pending: 'text-warning',
  failed: 'text-danger',
}

/** 同步状态(纯文字色,信息密度优先) */
export function UserSyncStatusBadge({ syncStatus }: { syncStatus: UserSyncStatus }) {
  const t = useTranslations('users.syncStatus')
  const color = SYNC_STYLES[syncStatus] ?? 'text-muted-foreground'
  return (
    <span className={`text-xs ${color}`}>
      {t(syncStatus in SYNC_STYLES ? syncStatus : 'pending')}
    </span>
  )
}

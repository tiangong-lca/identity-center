import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import type {
  ApplicationStatus,
  AssignmentStatus,
  BusinessProjectionStatus,
} from './queries'

export function AppStatusBadge({ status }: { status: ApplicationStatus }) {
  const t = useTranslations('apps.status')
  return (
    <Badge
      variant="secondary"
      className={
        status === 'active' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
      }
    >
      {t(status)}
    </Badge>
  )
}

const ASSIGNMENT_STATUS_CLASS: Record<AssignmentStatus, string> = {
  active: 'bg-success/10 text-success',
  revoked: 'bg-muted text-muted-foreground',
  expired: 'bg-warning/10 text-warning',
}

export function AssignmentStatusBadge({
  status,
  labels,
}: {
  status: AssignmentStatus
  labels: Record<AssignmentStatus, string>
}) {
  return (
    <Badge variant="secondary" className={ASSIGNMENT_STATUS_CLASS[status]}>
      {labels[status]}
    </Badge>
  )
}

const PROJECTION_CLASS: Record<BusinessProjectionStatus, string> = {
  projected: 'bg-success/10 text-success',
  pending: 'bg-warning/10 text-warning',
  failed: 'bg-danger/10 text-danger',
  not_required: 'bg-muted text-muted-foreground',
}

/** 投影状态 Badge:projected 绿 / pending 黄 / failed 红;失败时 title 提示最近错误 */
export function ProjectionBadge({
  status,
  error,
}: {
  status: BusinessProjectionStatus
  error?: string | null
}) {
  const t = useTranslations('apps.detail.assignments.projection')
  return (
    <Badge
      variant="secondary"
      className={PROJECTION_CLASS[status]}
      title={status === 'failed' && error ? error : undefined}
    >
      {t(status)}
    </Badge>
  )
}

import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import type { RegistrationStatus } from './queries'

const STATUS_CLASS: Record<RegistrationStatus, string> = {
  pending: 'bg-warning/10 text-warning',
  approved: 'bg-success/10 text-success',
  rejected: 'bg-danger/10 text-danger',
  cancelled: 'bg-muted text-muted-foreground',
}

export function RegistrationStatusBadge({ status }: { status: RegistrationStatus }) {
  const t = useTranslations('registrations.status')
  return (
    <Badge variant="secondary" className={STATUS_CLASS[status]}>
      {t(status)}
    </Badge>
  )
}

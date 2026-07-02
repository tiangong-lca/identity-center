'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAccountProfile } from './queries'

/** 个人资料 Descriptions:邮箱/显示名/状态/创建时间 */
export function ProfileCard() {
  const t = useTranslations('account.profile')
  const format = useFormatter()
  const profile = useAccountProfile()

  if (profile.isLoading) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-6 w-3/5" />
        </CardContent>
      </Card>
    )
  }

  if (profile.isError) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-danger">
            {t('loadFailed')}: {profile.error.message}
          </p>
        </CardContent>
      </Card>
    )
  }

  const data = profile.data
  if (!data) return null

  const statusBadge =
    data.status === 'active' ? (
      <Badge variant="outline" className="border-transparent bg-success/10 text-success">
        {t('statusActive')}
      </Badge>
    ) : data.status === 'disabled' ? (
      <Badge variant="outline" className="border-transparent bg-danger/10 text-danger">
        {t('statusDisabled')}
      </Badge>
    ) : (
      <Badge variant="outline">{data.status}</Badge>
    )

  const rows = [
    { label: t('email'), value: <span className="text-foreground">{data.email}</span> },
    {
      label: t('displayName'),
      value: <span className="text-foreground">{data.displayName ?? t('notSynced')}</span>,
    },
    { label: t('status'), value: statusBadge },
    {
      label: t('createdAt'),
      value: (
        <span className="text-foreground">
          {format.dateTime(new Date(data.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}
        </span>
      ),
    },
  ]

  return (
    <Card>
      <CardContent>
        <dl className="divide-y divide-border-light">
          {rows.map((row) => (
            <div key={row.label} className="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-4 py-2.5">
              <dt className="text-sm text-muted-foreground">{row.label}</dt>
              <dd className="min-w-0 truncate text-sm">{row.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

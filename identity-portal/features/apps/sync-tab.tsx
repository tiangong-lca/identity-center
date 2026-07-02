import { useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAssignments, type BusinessProjectionStatus } from './queries'

const SAMPLE_SIZE = 100

type Counts = Record<BusinessProjectionStatus, number>

function emptyCounts(): Counts {
  return { projected: 0, pending: 0, failed: 0, not_required: 0 }
}

function StatCell({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'success' | 'warning' | 'danger' | 'muted'
}) {
  const toneClass =
    tone === 'success'
      ? 'text-success'
      : tone === 'warning'
        ? 'text-warning'
        : tone === 'danger'
          ? 'text-danger'
          : 'text-muted-foreground'
  return (
    <div className="rounded-lg border border-border-light bg-background p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  )
}

/** 同步状态汇总:统计 projectionStatus 分布,说明对账任务每小时兜底 */
export function SyncTab({ appId }: { appId: string }) {
  const t = useTranslations('apps.detail.sync')
  const { data, isPending } = useAssignments(appId, { page: 1, pageSize: SAMPLE_SIZE })

  if (isPending) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
    )
  }

  const items = data?.items ?? []
  const kc = emptyCounts()
  const biz = emptyCounts()
  for (const assignment of items) {
    kc[assignment.projectionStatus] += 1
    biz[assignment.businessProjectionStatus] += 1
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-medium text-foreground">{t('title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('description', { sampled: items.length, total: data?.total ?? 0 })}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {t('empty')}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('kcTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                <StatCell label={t('projected')} value={kc.projected} tone="success" />
                <StatCell label={t('pending')} value={kc.pending} tone="warning" />
                <StatCell label={t('failed')} value={kc.failed} tone="danger" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('bizTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCell label={t('projected')} value={biz.projected} tone="success" />
                <StatCell label={t('pending')} value={biz.pending} tone="warning" />
                <StatCell label={t('failed')} value={biz.failed} tone="danger" />
                <StatCell label={t('notRequired')} value={biz.not_required} tone="muted" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card size="sm">
        <CardHeader>
          <CardDescription>{t('reconcileHint')}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

import { getTranslations } from 'next-intl/server'
import { createServiceContext } from '@/server/services/context'
import { createStatsService } from '@/server/services/stats-service'

export default async function AdminOverviewPage() {
  const t = await getTranslations('admin.overview')
  const kpis = await createStatsService(createServiceContext()).overview()
  const cards = [
    { key: 'totalUsers', value: kpis.users },
    { key: 'activeApps', value: kpis.apps },
    { key: 'pendingRegistrations', value: kpis.pendingRegistrations },
    { key: 'activeAssignments', value: kpis.activeAssignments },
  ] as const

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.key} className="rounded-lg border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">{t(c.key)}</p>
            <p className="mt-2 text-3xl font-semibold text-foreground">{c.value}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t('hint')}</p>
    </div>
  )
}

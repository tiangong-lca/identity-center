import { count, eq } from 'drizzle-orm'
import { getTranslations } from 'next-intl/server'
import * as schema from '@/db/schema'
import { createServiceContext } from '@/server/services/context'

async function loadKpis() {
  const { db } = createServiceContext()
  const [[users], [apps], [pending], [assignments]] = await Promise.all([
    db.select({ n: count() }).from(schema.portalUsers),
    db.select({ n: count() }).from(schema.applications).where(eq(schema.applications.status, 'active')),
    db
      .select({ n: count() })
      .from(schema.registrationRequests)
      .where(eq(schema.registrationRequests.status, 'pending')),
    db
      .select({ n: count() })
      .from(schema.applicationAssignments)
      .where(eq(schema.applicationAssignments.status, 'active')),
  ])
  return { users: users.n, apps: apps.n, pending: pending.n, assignments: assignments.n }
}

export default async function AdminOverviewPage() {
  const t = await getTranslations('admin.overview')
  const kpis = await loadKpis()
  const cards = [
    { key: 'totalUsers', value: kpis.users },
    { key: 'activeApps', value: kpis.apps },
    { key: 'pendingRegistrations', value: kpis.pending },
    { key: 'activeAssignments', value: kpis.assignments },
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

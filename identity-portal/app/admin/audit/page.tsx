import { getTranslations } from 'next-intl/server'
import { AuditPageClient } from '@/features/audit/audit-page-client'

export default async function AdminAuditPage() {
  const t = await getTranslations('audit')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <AuditPageClient />
    </div>
  )
}

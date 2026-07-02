import { getTranslations } from 'next-intl/server'
import { OrgsPageClient } from '@/features/orgs/orgs-page-client'

export default async function AdminOrgsPage() {
  const t = await getTranslations('orgs')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <OrgsPageClient />
    </div>
  )
}

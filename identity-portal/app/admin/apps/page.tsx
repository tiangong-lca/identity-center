import { getTranslations } from 'next-intl/server'
import { AppsSectionTabs } from '@/features/apps/apps-section-tabs'
import { AppsView } from '@/features/apps/apps-view'

export default async function AppsPage() {
  const t = await getTranslations('apps')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <AppsSectionTabs />
      <AppsView />
    </div>
  )
}

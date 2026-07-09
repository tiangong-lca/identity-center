// app/admin/apps/registry/page.tsx
import { getTranslations } from 'next-intl/server'
import { AppsSectionTabs } from '@/features/apps/apps-section-tabs'
import { CatalogView } from '@/features/catalog/catalog-view'

export default async function AppsRegistryPage() {
  const t = await getTranslations('apps')
  const tc = await getTranslations('catalog')
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{tc('subtitle')}</p>
      </div>
      <AppsSectionTabs />
      <CatalogView />
    </div>
  )
}

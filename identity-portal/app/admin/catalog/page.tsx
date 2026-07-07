// app/admin/catalog/page.tsx
import { getTranslations } from 'next-intl/server'
import { CatalogView } from '@/features/catalog/catalog-view'

export default async function CatalogPage() {
  const t = await getTranslations('catalog')
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <CatalogView />
    </div>
  )
}

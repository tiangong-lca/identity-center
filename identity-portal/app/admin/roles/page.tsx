import { getTranslations } from 'next-intl/server'
import { RolesPageClient } from '@/features/admin-rbac/roles-page-client'

export default async function AdminRolesPage() {
  const t = await getTranslations('roles')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <RolesPageClient />
    </div>
  )
}

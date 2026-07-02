import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { RegistrationRequestsView } from '@/features/registrations/registration-requests-view'

export default async function RegistrationRequestsPage() {
  const t = await getTranslations('registrations')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Link
          href="/admin/registration-config"
          className="shrink-0 text-sm text-primary hover:underline"
        >
          {t('configLink')}
        </Link>
      </div>
      <RegistrationRequestsView />
    </div>
  )
}

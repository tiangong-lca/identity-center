import { getTranslations } from 'next-intl/server'
import { SessionsTable } from '@/features/account/sessions-table'

export default async function AccountSessionsPage() {
  const t = await getTranslations('account.sessions')

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
      <SessionsTable />
    </div>
  )
}

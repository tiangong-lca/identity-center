import { getTranslations } from 'next-intl/server'
import { ProfileCard } from '@/features/account/profile-card'

export default async function AccountProfilePage() {
  const t = await getTranslations('account.profile')

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
      <ProfileCard />
    </div>
  )
}

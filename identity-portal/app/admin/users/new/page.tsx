import { getTranslations } from 'next-intl/server'
import { UserCreateForm } from '@/features/users/components/user-create-form'

export default async function AdminUserCreatePage() {
  const t = await getTranslations('users.create')

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
      <UserCreateForm />
    </div>
  )
}

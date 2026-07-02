import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { UsersTable } from '@/features/users/components/users-table'

export default async function AdminUsersPage() {
  const t = await getTranslations('users.list')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
        <Button asChild>
          <Link href="/admin/users/new">{t('createUser')}</Link>
        </Button>
      </div>
      <UsersTable />
    </div>
  )
}

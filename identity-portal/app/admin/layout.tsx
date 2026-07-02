import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { AdminShell } from '@/components/layout/admin-shell'
import { QueryProvider } from '@/components/layout/query-provider'
import { auth, signOut } from '@/lib/auth'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!session.user.isAdmin) redirect('/403')
  const t = await getTranslations('auth')

  return (
    <QueryProvider>
      <AdminShell
        userEmail={session.user.email ?? session.user.keycloakSub}
        signOutSlot={
          <form
            action={async () => {
              'use server'
              await signOut({ redirectTo: '/' })
            }}
          >
            <button
              type="submit"
              className="rounded border border-border px-2 py-1 text-xs text-secondary-foreground hover:bg-accent"
            >
              {t('signOut')}
            </button>
          </form>
        }
      >
        {children}
      </AdminShell>
    </QueryProvider>
  )
}

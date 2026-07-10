import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LocaleToggle } from '@/components/layout/locale-toggle'
import { QueryProvider } from '@/components/layout/query-provider'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { AccountNav } from '@/features/account/account-nav'
import { auth } from '@/lib/auth'

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const t = await getTranslations('account')
  const tc = await getTranslations('common')

  return (
    <QueryProvider>
      <div className="flex min-h-screen flex-col">
        <header className="flex h-[50px] items-center justify-between border-b border-border bg-card px-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="inline-block size-5 rounded bg-[#0080FF]" aria-hidden />
              <span className="text-sm font-semibold text-foreground">{tc('appName')}</span>
            </Link>
            <AccountNav />
          </div>
          <div className="flex items-center gap-4">
            <span
              className="max-w-40 truncate text-xs text-muted-foreground"
              title={session.user.email ?? session.user.keycloakSub}
            >
              {session.user.email ?? session.user.keycloakSub}
            </span>
            <Link href="/" className="text-xs text-primary hover:underline">
              {t('nav.backToPortal')}
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-8 py-6">{children}</main>

        <footer className="flex items-center justify-center gap-6 border-t border-border py-3">
          <LocaleToggle />
          <ThemeToggle />
        </footer>
      </div>
    </QueryProvider>
  )
}

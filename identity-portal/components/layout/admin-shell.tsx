'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LocaleToggle } from './locale-toggle'
import { ThemeToggle } from './theme-toggle'

const NAV_ITEMS = [
  { href: '/admin', key: 'overview', exact: true },
  { href: '/admin/users', key: 'users', exact: false },
  { href: '/admin/registration-requests', key: 'registrations', exact: false },
  { href: '/admin/apps', key: 'apps', exact: false },
  { href: '/admin/orgs', key: 'orgs', exact: false },
  { href: '/admin/roles', key: 'roles', exact: false },
  { href: '/admin/audit', key: 'audit', exact: false },
  { href: '/admin/settings', key: 'settings', exact: false },
] as const

export function AdminShell({
  userEmail,
  signOutSlot,
  children,
}: {
  userEmail: string
  signOutSlot: React.ReactNode
  children: React.ReactNode
}) {
  const t = useTranslations('nav')
  const tc = useTranslations('common')
  const tp = useTranslations('portal')
  const pathname = usePathname()

  return (
    <div className="flex min-h-screen flex-row">
      <aside className="flex w-[180px] shrink-0 flex-col bg-[#0080FF] text-white">
        <div className="flex h-[50px] items-center border-b border-white/10 px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">{tc('appName')}</span>
          </Link>
        </div>
        <nav className="flex flex-col gap-0.5 p-2">
          <Link
            href="/"
            className="flex h-9 items-center rounded-md px-3 text-sm text-white/90 transition-colors hover:bg-white/30"
          >
            {tp('home')}
          </Link>
          {NAV_ITEMS.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex h-9 items-center rounded-md px-3 text-sm transition-colors ${
                  active
                    ? 'bg-white/30 font-medium text-white'
                    : 'text-white/90 hover:bg-white/30'
                }`}
              >
                {t(item.key)}
              </Link>
            )
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[50px] shrink-0 items-center justify-between border-b border-border bg-card px-4">
          <div className="flex items-center gap-4">
            <LocaleToggle />
            <ThemeToggle />
          </div>
          <div className="flex items-center gap-4">
            <span className="max-w-40 truncate text-xs text-muted-foreground" title={userEmail}>
              {userEmail}
            </span>
            {signOutSlot}
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}

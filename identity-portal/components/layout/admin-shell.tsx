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
  { href: '/admin/catalog', key: 'catalog', exact: false },
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
  const pathname = usePathname()

  return (
    <div className="flex min-h-screen flex-col">
      {/* TopNav 48px(设计 shell 契约) */}
      <header className="flex h-12 items-center justify-between border-b border-border bg-card px-4">
        <Link href="/admin" className="flex items-center gap-2">
          <span className="inline-block size-5 rounded bg-primary" aria-hidden />
          <span className="text-sm font-semibold text-foreground">{tc('appName')}</span>
        </Link>
        <div className="flex items-center gap-4">
          <LocaleToggle />
          <ThemeToggle />
          <span className="max-w-40 truncate text-xs text-muted-foreground" title={userEmail}>
            {userEmail}
          </span>
          {signOutSlot}
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar 200px,菜单项 36px */}
        <aside className="w-50 shrink-0 border-r border-border bg-sidebar">
          <nav className="flex flex-col gap-0.5 p-2">
            {NAV_ITEMS.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex h-9 items-center rounded-md px-3 text-sm transition-colors ${
                    active
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-secondary-foreground hover:bg-sidebar-accent'
                  }`}
                >
                  {t(item.key)}
                </Link>
              )
            })}
          </nav>
        </aside>

        {/* 内容区:32px 侧边距(设计对齐规则) */}
        <main className="min-w-0 flex-1 bg-background px-8 py-6">{children}</main>
      </div>
    </div>
  )
}

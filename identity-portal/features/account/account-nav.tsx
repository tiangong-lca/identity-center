'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/account', key: 'profile', exact: true },
  { href: '/account/security', key: 'security', exact: false },
  { href: '/account/sessions', key: 'sessions', exact: false },
] as const

/** 账号中心顶部导航:资料 / 安全 / 会话 */
export function AccountNav() {
  const t = useTranslations('account.nav')
  const pathname = usePathname()

  return (
    <nav className="flex items-center gap-1">
      {NAV_ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex h-8 items-center rounded-md px-3 text-sm transition-colors ${
              active
                ? 'bg-primary/10 font-medium text-primary'
                : 'text-secondary-foreground hover:bg-accent'
            }`}
          >
            {t(item.key)}
          </Link>
        )
      })}
    </nav>
  )
}

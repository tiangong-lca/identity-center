// features/apps/apps-section-tabs.tsx
'use client'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/admin/apps', key: 'appsList' },
  { href: '/admin/apps/registry', key: 'appsRegistry' },
] as const

/** 「应用」区段内标签页:应用列表 / 应用注册表。渲染在两个 section landing 页顶部。 */
export function AppsSectionTabs() {
  const t = useTranslations('nav')
  const pathname = usePathname()
  const onRegistry = pathname.startsWith('/admin/apps/registry')
  return (
    <nav className="flex gap-1 border-b border-border">
      {TABS.map((tab) => {
        const active = tab.href === '/admin/apps/registry' ? onRegistry : !onRegistry
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              active
                ? 'border-primary font-medium text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t(tab.key)}
          </Link>
        )
      })}
    </nav>
  )
}

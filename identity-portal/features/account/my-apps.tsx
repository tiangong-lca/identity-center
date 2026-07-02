'use client'

import { ExternalLinkIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Skeleton } from '@/components/ui/skeleton'
import { useAccountApps } from './queries'

/** 门户首页「我的应用」宫格:点击卡片新窗口打开应用登录地址 */
export function MyApps() {
  const t = useTranslations('portal')
  const apps = useAccountApps()

  return (
    <section className="flex w-full flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-foreground">{t('myApps')}</h2>
        <p className="text-xs text-muted-foreground">{t('myAppsHint')}</p>
      </div>

      {apps.isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : apps.isError ? (
        <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-danger">
          {t('loadFailed')}: {apps.error.message}
        </p>
      ) : (apps.data?.items.length ?? 0) === 0 ? (
        <p className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {t('empty')}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {apps.data?.items.map((app) =>
            app.loginUrl ? (
              <a
                key={app.id}
                href={app.loginUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="group flex flex-col gap-1.5 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary hover:bg-primary/5"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                    {app.name}
                  </span>
                  <ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
                </span>
                <span className="truncate font-mono text-xs text-muted-foreground">{app.code}</span>
              </a>
            ) : (
              <div
                key={app.id}
                className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-4 opacity-70"
              >
                <span className="truncate text-sm font-medium text-foreground">{app.name}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">{app.code}</span>
                <span className="text-xs text-muted-foreground">{t('noLoginUrl')}</span>
              </div>
            ),
          )}
        </div>
      )}
    </section>
  )
}

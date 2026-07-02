'use client'

import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'

const THEMES = ['light', 'dark', 'system'] as const

const emptySubscribe = () => () => {}
/** 服务端渲染返回 false、客户端水合后返回 true,规避主题未知时的水合闪烁 */
function useHydrated() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )
}

export function ThemeToggle() {
  const t = useTranslations('common.theme')
  const { theme, setTheme } = useTheme()
  const hydrated = useHydrated()

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{t('label')}</span>
      <select
        className="rounded border border-border bg-card px-2 py-1"
        value={hydrated ? (theme ?? 'system') : 'system'}
        onChange={(e) => setTheme(e.target.value)}
      >
        {THEMES.map((value) => (
          <option key={value} value={value}>
            {t(value)}
          </option>
        ))}
      </select>
    </label>
  )
}

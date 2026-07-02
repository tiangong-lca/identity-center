'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useTransition } from 'react'
import { locales } from '@/i18n/config'
import { setLocale } from '@/lib/i18n/locale-actions'

export function LocaleToggle() {
  const t = useTranslations('common.language')
  const locale = useLocale()
  const [pending, startTransition] = useTransition()

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{t('label')}</span>
      <select
        className="rounded border border-border bg-card px-2 py-1"
        value={locale}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value
          startTransition(() => setLocale(next))
        }}
      >
        {locales.map((value) => (
          <option key={value} value={value}>
            {t(value)}
          </option>
        ))}
      </select>
    </label>
  )
}

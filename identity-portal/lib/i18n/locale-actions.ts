'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { isAppLocale, LOCALE_COOKIE } from '@/i18n/config'

export async function setLocale(locale: string) {
  if (!isAppLocale(locale)) return

  const store = await cookies()
  store.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
  revalidatePath('/', 'layout')
}

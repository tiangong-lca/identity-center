import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import { defaultLocale, isAppLocale, LOCALE_COOKIE } from './config'

export default getRequestConfig(async () => {
  const store = await cookies()
  const cookieLocale = store.get(LOCALE_COOKIE)?.value
  const locale = isAppLocale(cookieLocale) ? cookieLocale : defaultLocale

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})

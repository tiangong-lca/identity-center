import { getTranslations } from 'next-intl/server'
import Link from 'next/link'

export default async function ForbiddenPage() {
  const t = await getTranslations('errors')
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-semibold text-foreground">403</h1>
      <p className="text-sm text-muted-foreground">{t('forbidden')}</p>
      <Link href="/" className="text-sm text-primary hover:underline">
        {t('backHome')}
      </Link>
    </main>
  )
}

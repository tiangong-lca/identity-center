import { ExternalLinkIcon } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function AccountSecurityPage() {
  const t = await getTranslations('account.security')
  // 服务端读取 Keycloak 地址并拼接账户中心链接(不引入 NEXT_PUBLIC)
  const keycloakBase = (process.env.KEYCLOAK_BASE_URL ?? 'http://localhost:8080').replace(/\/$/, '')
  const accountConsoleUrl = `${keycloakBase}/realms/company-dev/account`

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('managedByKeycloak')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('passwordTitle')}</CardTitle>
            <CardDescription>{t('passwordDesc')}</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('mfaTitle')}</CardTitle>
            <CardDescription>{t('mfaDesc')}</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div>
        <a
          href={accountConsoleUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
        >
          {t('openKeycloak')}
          <ExternalLinkIcon className="size-4" />
        </a>
      </div>
    </div>
  )
}

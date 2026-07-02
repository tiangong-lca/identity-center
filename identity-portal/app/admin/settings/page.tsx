import { getTranslations } from 'next-intl/server'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

/** 平台版本(发布流水线注入前的静态说明值) */
const PLATFORM_VERSION = '1.0.0'
/** Keycloak realm 为部署配置项,页面不引入 NEXT_PUBLIC 环境变量,仅作静态说明 */
const KEYCLOAK_REALM = 'company-dev'

export default async function AdminSettingsPage() {
  const t = await getTranslations('settings')

  const reconciliationItems = [
    t('reconciliation.highRisk'),
    t('reconciliation.profile'),
    t('reconciliation.full'),
  ]
  const baselineItems = [t('baseline.item1'), t('baseline.item2'), t('baseline.item3')]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('readOnlyHint')}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('version.title')}</CardTitle>
            <CardDescription>{t('version.desc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-semibold text-foreground">{PLATFORM_VERSION}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('realm.title')}</CardTitle>
            <CardDescription>{t('realm.desc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="font-mono">
              {KEYCLOAK_REALM}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('reconciliation.title')}</CardTitle>
            <CardDescription>{t('reconciliation.desc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-secondary-foreground">
              {reconciliationItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('baseline.title')}</CardTitle>
            <CardDescription>{t('baseline.desc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-secondary-foreground">
              {baselineItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

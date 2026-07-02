import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Descriptions } from '@/features/shared/descriptions'

/** 注册管理:策略为部署配置,页面只读说明(无交互岛) */
export default async function RegistrationConfigPage() {
  const t = await getTranslations('registrations.config')

  const readOnlyBadge = (
    <Badge variant="secondary" className="bg-muted text-muted-foreground">
      {t('readOnly')}
    </Badge>
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/registration-requests"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← {t('backToList')}
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t('policy.title')}
            {readOnlyBadge}
          </CardTitle>
          <CardDescription>{t('policy.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Descriptions
            items={[
              {
                key: 'selfRegister',
                label: t('policy.selfRegister'),
                value: t('policy.selfRegisterValue'),
              },
              {
                key: 'approval',
                label: t('policy.approval'),
                value: t('policy.approvalValue'),
              },
              {
                key: 'onApprove',
                label: t('policy.onApprove'),
                value: t('policy.onApproveValue'),
              },
              {
                key: 'onReject',
                label: t('policy.onReject'),
                value: t('policy.onRejectValue'),
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t('autoApprove.title')}
            {readOnlyBadge}
          </CardTitle>
          <CardDescription>{t('autoApprove.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Descriptions
            items={[
              {
                key: 'envKey',
                label: t('autoApprove.envKey'),
                value: (
                  <code className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
                    REGISTRATION_AUTO_APPROVE
                  </code>
                ),
              },
              {
                key: 'current',
                label: t('autoApprove.current'),
                value: t('autoApprove.currentValue'),
              },
              {
                key: 'change',
                label: t('autoApprove.change'),
                value: t('autoApprove.changeValue'),
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t('modeA.title')}
            {readOnlyBadge}
          </CardTitle>
          <CardDescription>{t('modeA.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Descriptions
            items={[
              { key: 'entry', label: t('modeA.entry'), value: t('modeA.entryValue') },
              { key: 'duty', label: t('modeA.duty'), value: t('modeA.dutyValue') },
              { key: 'verify', label: t('modeA.verify'), value: t('modeA.verifyValue') },
              {
                key: 'reconcile',
                label: t('modeA.reconcile'),
                value: t('modeA.reconcileValue'),
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  )
}

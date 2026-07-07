'use client'

import { ArrowLeftIcon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ApiClientError } from '@/features/shared/api'
import { Descriptions } from '@/features/shared/descriptions'
import { AssignmentsTab } from './assignments-tab'
import { useApplication, type Application } from './queries'
import { RoleAssignmentsTab } from './role-assignments-tab'
import { RolesTab } from './roles-tab'
import { AppStatusBadge } from './status-badges'
import { SyncTab } from './sync-tab'

function EditInCatalogLink() {
  const t = useTranslations('apps.detail')
  return (
    <Button asChild variant="outline" size="sm">
      <Link href="/admin/catalog">{t('editInCatalog')}</Link>
    </Button>
  )
}

const TAB_VALUES = [
  'basic',
  'keycloak',
  'assignments',
  'roles',
  'roleAssignments',
  'sync',
] as const

function CodeChip({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
      {children}
    </code>
  )
}

function BasicTab({ app }: { app: Application }) {
  const t = useTranslations('apps.detail.basic')
  const tDetail = useTranslations('apps.detail')
  const format = useFormatter()
  const none = tDetail('none')

  const link = (url: string | null) =>
    url ? (
      <a href={url} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline">
        {url}
      </a>
    ) : (
      none
    )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <EditInCatalogLink />
      </div>
      <div className="rounded-lg border border-border bg-card p-6">
        <Descriptions
          items={[
            { key: 'code', label: t('code'), value: <CodeChip>{app.code}</CodeChip> },
            { key: 'name', label: t('name'), value: app.name },
            { key: 'status', label: t('status'), value: <AppStatusBadge status={app.status} /> },
            { key: 'loginUrl', label: t('loginUrl'), value: link(app.loginUrl) },
            { key: 'adminUrl', label: t('adminUrl'), value: link(app.adminUrl) },
            { key: 'webhookUrl', label: t('webhookUrl'), value: link(app.webhookUrl) },
            {
              key: 'webhookSecretRef',
              label: t('webhookSecretRef'),
              value: app.webhookSecretRef ? <CodeChip>{app.webhookSecretRef}</CodeChip> : none,
            },
            {
              key: 'createdAt',
              label: t('createdAt'),
              value: format.dateTime(new Date(app.createdAt), {
                dateStyle: 'medium',
                timeStyle: 'short',
              }),
            },
            {
              key: 'updatedAt',
              label: t('updatedAt'),
              value: format.dateTime(new Date(app.updatedAt), {
                dateStyle: 'medium',
                timeStyle: 'short',
              }),
            },
          ]}
        />
      </div>
    </div>
  )
}

function KeycloakTab({ app }: { app: Application }) {
  const t = useTranslations('apps.detail.keycloak')
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <EditInCatalogLink />
      </div>
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-base font-medium text-foreground">{t('title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
        <Descriptions
          className="mt-5"
          items={[
            {
              key: 'clientId',
              label: t('clientId'),
              value: <CodeChip>{app.keycloakClientId}</CodeChip>,
            },
            {
              key: 'accessClientRole',
              label: t('accessClientRole'),
              value: <CodeChip>{app.accessClientRole}</CodeChip>,
            },
          ]}
        />
        <p className="mt-5 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          {t('hint')}
        </p>
      </div>
    </div>
  )
}

export function AppDetailView({ id }: { id: string }) {
  const t = useTranslations('apps.detail')
  const { data: app, isPending, isError, error, refetch } = useApplication(id)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/admin/apps"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          {t('back')}
        </Link>
      </div>

      {isPending ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : isError || !app ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {isError &&
            error instanceof ApiClientError &&
            error.code === 'APPLICATION_NOT_FOUND'
              ? t('notFound')
              : t('loadFailed')}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            {t('retry')}
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-foreground">{app.name}</h1>
            <AppStatusBadge status={app.status} />
            <span className="font-mono text-xs text-muted-foreground">{app.code}</span>
          </div>

          <Tabs defaultValue="basic">
            <TabsList variant="line" className="border-b border-border pb-1">
              {TAB_VALUES.map((value) => (
                <TabsTrigger key={value} value={value}>
                  {t(`tabs.${value}`)}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="basic" className="pt-2">
              <BasicTab app={app} />
            </TabsContent>
            <TabsContent value="keycloak" className="pt-2">
              <KeycloakTab app={app} />
            </TabsContent>
            <TabsContent value="assignments" className="pt-2">
              <AssignmentsTab appId={app.id} />
            </TabsContent>
            <TabsContent value="roles" className="pt-2">
              <RolesTab appId={app.id} />
            </TabsContent>
            <TabsContent value="roleAssignments" className="pt-2">
              <RoleAssignmentsTab appId={app.id} />
            </TabsContent>
            <TabsContent value="sync" className="pt-2">
              <SyncTab appId={app.id} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}

'use client'

import { ArrowLeftIcon, ExternalLinkIcon } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ApiClientError } from '@/features/shared/api'
import { formatDateTime } from '@/features/users/format'
import { useRevokeAssignmentMutation, useUserAssignmentsQuery, useUserQuery } from '@/features/users/queries'
import type { PortalUser } from '@/features/users/types'
import { AssignAppDialog } from './assign-app-dialog'
import { UserAuditLog } from './user-audit-log'
import { UserStatusBadge, UserSyncStatusBadge } from './user-badges'
import { UserDangerZone } from './user-danger-zone'
import { AssignmentStatusBadge } from '@/features/apps/status-badges'
import type { UserAssignment } from '@/features/users/queries'

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-7" />
        <Skeleton className="h-7 w-56" />
      </div>
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <Skeleton className="h-64 min-w-0 flex-1" />
        <Skeleton className="h-64 w-full xl:w-80" />
      </div>
    </div>
  )
}

function OverviewCard({ user }: { user: PortalUser }) {
  const t = useTranslations('users.detail')
  const tc = useTranslations('users.common')
  const locale = useLocale()

  const rows: { key: string; value: React.ReactNode }[] = [
    { key: 'email', value: user.email },
    {
      key: 'displayName',
      value: user.displayName ?? <span className="text-muted-foreground">{tc('noName')}</span>,
    },
    { key: 'status', value: <UserStatusBadge status={user.status} /> },
    { key: 'syncStatus', value: <UserSyncStatusBadge syncStatus={user.syncStatus} /> },
    { key: 'id', value: <span className="font-mono text-xs break-all">{user.id}</span> },
    {
      key: 'keycloakSub',
      value: <span className="font-mono text-xs break-all">{user.keycloakSub}</span>,
    },
    { key: 'createdAt', value: formatDateTime(user.createdAt, locale) },
    { key: 'updatedAt', value: formatDateTime(user.updatedAt, locale) },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('overviewTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.key} className="flex min-w-0 flex-col gap-1">
              <dt className="text-xs text-muted-foreground">{t(`fields.${row.key}`)}</dt>
              <dd className="text-sm text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

function AppsCard({ user }: { user: PortalUser }) {
  const t = useTranslations('users.assign')
  const tToast = useTranslations('apps.toast')
  const assignments = useUserAssignmentsQuery(user.id)
  const revoke = useRevokeAssignmentMutation(user.id)
  const items = assignments.data?.items ?? []
  const [revokeTarget, setRevokeTarget] = useState<UserAssignment | null>(null)

  const statusLabels = {
    active: t('statusActive'),
    revoked: t('statusRevoked'),
    expired: t('statusExpired'),
  }

  const handleRevoke = () => {
    if (!revokeTarget) return
    revoke.mutate(
      { applicationId: revokeTarget.applicationId, assignmentId: revokeTarget.id },
      {
        onSuccess: () => toast.success(t('revoked')),
        onError: (error) => {
          if (error instanceof ApiClientError && error.code === 'KEYCLOAK_ERROR') {
            toast.warning(t('revokeRetry'))
            return
          }
          toast.error(tToast('failed', {
            message: error instanceof ApiClientError ? error.message : String(error),
          }))
        },
      },
    )
    setRevokeTarget(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('hint')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {user.status !== 'active' ? (
          <p className="text-xs text-warning">{t('disabledUserHint')}</p>
        ) : null}

        {assignments.isPending ? (
          <p className="text-xs text-muted-foreground">{t('loading')}</p>
        ) : items.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('appName')}</TableHead>
                  <TableHead>{t('appStatus')}</TableHead>
                  <TableHead>{t('appLoginUrl')}</TableHead>
                  <TableHead className="text-right">{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.appName ?? a.appCode}</TableCell>
                    <TableCell>
                      <AssignmentStatusBadge status={a.status} labels={statusLabels} />
                    </TableCell>
                    <TableCell>
                      {a.appLoginUrl ? (
                        <a
                          href={a.appLoginUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          {t('openApp')}
                          <ExternalLinkIcon className="size-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {a.status === 'active' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger hover:text-danger"
                          disabled={revoke.isPending}
                          onClick={() => setRevokeTarget(a)}
                        >
                          {t('revoke')}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t('noAssignments')}</p>
        )}

        <div>
          <AssignAppDialog user={user} assignedAppIds={items.filter((a) => a.status === 'active').map((a) => a.applicationId)} />
        </div>
      </CardContent>

      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('revokeConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('revokeConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleRevoke}>
              {t('revokeConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

export function UserDetail({ id }: { id: string }) {
  const t = useTranslations('users.detail')
  const tc = useTranslations('users.common')
  const query = useUserQuery(id)

  if (query.isPending) return <DetailSkeleton />

  if (query.isError || !query.data) {
    const notFound =
      query.error instanceof ApiClientError &&
      (query.error.code === 'USER_NOT_FOUND' || query.error.status === 404)
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-card py-16">
          <p className="text-sm text-muted-foreground">
            {notFound ? t('notFound') : tc('requestFailed')}
          </p>
          <div className="flex items-center gap-2">
            {notFound ? null : (
              <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                {t('retry')}
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/users">{t('back')}</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const user = query.data

  return (
    <div className="flex flex-col gap-6">
      {/* 头部:返回 + 姓名/邮箱/状态 */}
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon-sm" className="mt-0.5">
          <Link href="/admin/users" aria-label={t('back')}>
            <ArrowLeftIcon />
          </Link>
        </Button>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-xl font-semibold text-foreground">
              {user.displayName || user.email}
            </h1>
            <UserStatusBadge status={user.status} />
          </div>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        {/* 左侧:Tabs */}
        <Tabs defaultValue="overview" className="min-w-0 flex-1">
          <TabsList variant="line">
            <TabsTrigger value="overview">{t('tabs.overview')}</TabsTrigger>
            <TabsTrigger value="apps">{t('tabs.apps')}</TabsTrigger>
            <TabsTrigger value="audit">{t('tabs.audit')}</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="pt-2">
            <OverviewCard user={user} />
          </TabsContent>
          <TabsContent value="apps" className="pt-2">
            <AppsCard user={user} />
          </TabsContent>
          <TabsContent value="audit" className="pt-2">
            <UserAuditLog userId={user.id} />
          </TabsContent>
        </Tabs>

        {/* 右侧:危险操作区 */}
        <div className="w-full shrink-0 xl:w-80">
          <UserDangerZone user={user} />
        </div>
      </div>
    </div>
  )
}

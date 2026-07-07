'use client'

import { useFormatter, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useApplications } from './queries'
import { AppStatusBadge } from './status-badges'

const PAGE_SIZE = 20
const COLUMN_COUNT = 5

export function AppsView() {
  const t = useTranslations('apps')
  const format = useFormatter()
  const [page, setPage] = useState(1)
  const { data, isPending, isError, refetch } = useApplications({ page, pageSize: PAGE_SIZE })
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
        <span>{t('catalogManaged.notice')}</span>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/apps/registry">{t('catalogManaged.link')}</Link>
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('table.app')}</TableHead>
              <TableHead>{t('table.clientId')}</TableHead>
              <TableHead>{t('table.status')}</TableHead>
              <TableHead>{t('table.createdAt')}</TableHead>
              <TableHead className="text-right">{t('table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: 4 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={COLUMN_COUNT}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="py-8 text-center">
                  <span className="text-muted-foreground">{t('table.loadFailed')}</span>
                  <Button variant="link" size="sm" className="ml-2" onClick={() => refetch()}>
                    {t('table.retry')}
                  </Button>
                </TableCell>
              </TableRow>
            ) : data && data.items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-8 text-center text-muted-foreground"
                >
                  {t('table.empty')}
                </TableCell>
              </TableRow>
            ) : (
              data?.items.map((app) => (
                <TableRow key={app.id}>
                  <TableCell>
                    <Link
                      href={`/admin/apps/${app.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {app.name}
                    </Link>
                    <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
                      {app.code}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-secondary-foreground">
                      {app.keycloakClientId}
                    </span>
                  </TableCell>
                  <TableCell>
                    <AppStatusBadge status={app.status} />
                  </TableCell>
                  <TableCell className="text-secondary-foreground">
                    {format.dateTime(new Date(app.createdAt), { dateStyle: 'medium' })}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="text-primary hover:text-primary"
                    >
                      <Link href={`/admin/apps/${app.id}`}>{t('table.detail')}</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{t('pagination.total', { total: data.total })}</span>
          <div className="flex items-center gap-3">
            <span>{t('pagination.pageInfo', { page: data.page, totalPages })}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t('pagination.prev')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('pagination.next')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

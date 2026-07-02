'use client'

import { useFormatter, useTranslations } from 'next-intl'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useRegistrationRequests,
  type RegistrationRequest,
  type RegistrationStatus,
} from './queries'
import { RegistrationStatusBadge } from './registration-status-badge'
import { ReviewDialog } from './review-dialog'

const TABS = ['pending', 'approved', 'rejected', 'all'] as const
type TabValue = (typeof TABS)[number]

const PAGE_SIZE = 20
const COLUMN_COUNT = 7

export function RegistrationRequestsView() {
  const t = useTranslations('registrations')
  const format = useFormatter()
  const [tab, setTab] = useState<TabValue>('pending')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<RegistrationRequest | null>(null)

  const status = tab === 'all' ? undefined : (tab as RegistrationStatus)
  const { data, isPending, isError, refetch } = useRegistrationRequests({
    page,
    pageSize: PAGE_SIZE,
    status,
  })
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as TabValue)
          setPage(1)
        }}
      >
        <TabsList>
          {TABS.map((value) => (
            <TabsTrigger key={value} value={value}>
              {t(`tabs.${value}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('table.email')}</TableHead>
              <TableHead>{t('table.displayName')}</TableHead>
              <TableHead>{t('table.reason')}</TableHead>
              <TableHead>{t('table.status')}</TableHead>
              <TableHead>{t('table.createdAt')}</TableHead>
              <TableHead>{t('table.reviewedBy')}</TableHead>
              <TableHead className="text-right">{t('table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: 5 }, (_, i) => (
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
                  <Button
                    variant="link"
                    size="sm"
                    className="ml-2"
                    onClick={() => refetch()}
                  >
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
              data?.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium text-foreground">{item.email}</TableCell>
                  <TableCell className="text-secondary-foreground">
                    {item.displayName ?? t('dialog.none')}
                  </TableCell>
                  <TableCell>
                    <span
                      className="block max-w-56 truncate text-secondary-foreground"
                      title={item.requestedReason ?? undefined}
                    >
                      {item.requestedReason ?? t('dialog.none')}
                    </span>
                  </TableCell>
                  <TableCell>
                    <RegistrationStatusBadge status={item.status} />
                  </TableCell>
                  <TableCell className="text-secondary-foreground">
                    {format.dateTime(new Date(item.createdAt), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </TableCell>
                  <TableCell>
                    <span
                      className="block max-w-40 truncate text-secondary-foreground"
                      title={item.reviewedBy ?? undefined}
                    >
                      {item.reviewedBy ?? t('dialog.none')}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-primary hover:text-primary"
                      onClick={() => setSelected(item)}
                    >
                      {item.status === 'pending' ? t('actions.review') : t('actions.view')}
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

      <ReviewDialog request={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

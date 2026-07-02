'use client'

import { useLocale, useTranslations } from 'next-intl'
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
import { formatDateTime } from '@/features/users/format'
import { useUserAuditLogsQuery } from '@/features/users/queries'

/** 该用户相关的审计记录(最近 20 条) */
export function UserAuditLog({ userId }: { userId: string }) {
  const t = useTranslations('users.audit')
  const locale = useLocale()
  const query = useUserAuditLogsQuery(userId)
  const items = query.data?.items ?? []

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">{t('hint')}</p>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="px-3">{t('columns.createdAt')}</TableHead>
              <TableHead className="px-3">{t('columns.action')}</TableHead>
              <TableHead className="px-3">{t('columns.actor')}</TableHead>
              <TableHead className="px-3">{t('columns.result')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isPending ? (
              Array.from({ length: 4 }).map((_, index) => (
                <TableRow key={index}>
                  {Array.from({ length: 4 }).map((_, cell) => (
                    <TableCell key={cell} className="px-3 py-3">
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : query.isError ? (
              <TableRow>
                <TableCell colSpan={4} className="px-3 py-10 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-sm text-danger">{t('loadFailed')}</p>
                    <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                      {t('retry')}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="px-3 py-10 text-center text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              items.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="px-3 text-xs text-secondary-foreground">
                    {formatDateTime(entry.createdAt, locale)}
                  </TableCell>
                  <TableCell className="px-3 font-mono text-xs">{entry.action}</TableCell>
                  <TableCell className="max-w-48 truncate px-3 text-xs text-secondary-foreground">
                    {entry.actorEmail ?? entry.actorKeycloakSub}
                  </TableCell>
                  <TableCell className="px-3">
                    <span
                      className={`text-xs ${entry.result === 'success' ? 'text-success' : 'text-danger'}`}
                    >
                      {entry.result === 'success' ? t('result.success') : t('result.failure')}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAccountSessions } from './queries'

/** 当前用户 Keycloak 登录会话表:IP / 开始时间 / 最后活跃 / 客户端 */
export function SessionsTable() {
  const t = useTranslations('account.sessions')
  const format = useFormatter()
  const sessions = useAccountSessions()

  const dateOf = (value?: number) =>
    value
      ? format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' })
      : '—'

  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('ip')}</TableHead>
            <TableHead>{t('start')}</TableHead>
            <TableHead>{t('lastAccess')}</TableHead>
            <TableHead>{t('clients')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.isLoading ? (
            Array.from({ length: 2 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={4}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : sessions.isError ? (
            <TableRow>
              <TableCell colSpan={4} className="py-8 text-center text-danger">
                {t('loadFailed')}: {sessions.error.message}
              </TableCell>
            </TableRow>
          ) : (sessions.data?.items.length ?? 0) === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                {t('empty')}
              </TableCell>
            </TableRow>
          ) : (
            sessions.data?.items.map((session, index) => (
              <TableRow key={session.id ?? index}>
                <TableCell className="font-mono text-xs">{session.ipAddress ?? '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {dateOf(session.start)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {dateOf(session.lastAccess)}
                </TableCell>
                <TableCell className="max-w-64 truncate text-xs text-muted-foreground">
                  {session.clients ? Object.values(session.clients).join(', ') : '—'}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

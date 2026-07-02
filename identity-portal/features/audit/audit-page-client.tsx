'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AUDIT_PAGE_SIZE, useAuditLogs, type AuditLogRow } from './queries'

export function AuditPageClient() {
  const t = useTranslations('audit')
  const format = useFormatter()

  const [actionInput, setActionInput] = useState('')
  const [targetTypeInput, setTargetTypeInput] = useState('')
  const [filters, setFilters] = useState<{ action?: string; targetType?: string }>({})
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<AuditLogRow | null>(null)

  const logs = useAuditLogs({ page, ...filters })
  const total = logs.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE))

  const applyFilters = () => {
    setPage(1)
    setFilters({
      action: actionInput.trim() || undefined,
      targetType: targetTypeInput.trim() || undefined,
    })
  }

  const resetFilters = () => {
    setActionInput('')
    setTargetTypeInput('')
    setFilters({})
    setPage(1)
  }

  const resultBadge = (log: AuditLogRow) =>
    log.result === 'success' ? (
      <Badge variant="outline" className="border-transparent bg-success/10 text-success">
        {t('result.success')}
      </Badge>
    ) : (
      <Badge variant="outline" className="border-transparent bg-danger/10 text-danger">
        {t('result.failure')}
      </Badge>
    )

  return (
    <div className="flex flex-col gap-4">
      {/* 筛选行 */}
      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          applyFilters()
        }}
      >
        <Input
          className="w-56"
          value={actionInput}
          onChange={(e) => setActionInput(e.target.value)}
          placeholder={t('filters.actionPlaceholder')}
          aria-label={t('filters.action')}
        />
        <Input
          className="w-56"
          value={targetTypeInput}
          onChange={(e) => setTargetTypeInput(e.target.value)}
          placeholder={t('filters.targetTypePlaceholder')}
          aria-label={t('filters.targetType')}
        />
        <Button type="submit" variant="outline">
          {t('filters.apply')}
        </Button>
        <Button type="button" variant="ghost" onClick={resetFilters}>
          {t('filters.reset')}
        </Button>
      </form>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('table.time')}</TableHead>
              <TableHead>{t('table.action')}</TableHead>
              <TableHead>{t('table.actor')}</TableHead>
              <TableHead>{t('table.target')}</TableHead>
              <TableHead>{t('table.result')}</TableHead>
              <TableHead>{t('table.requestId')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : logs.isError ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-danger">
                  {t('loadFailed')}: {logs.error.message}
                </TableCell>
              </TableRow>
            ) : (logs.data?.items.length ?? 0) === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              logs.data?.items.map((log) => (
                <TableRow
                  key={log.id}
                  className="cursor-pointer"
                  onClick={() => setDetail(log)}
                >
                  <TableCell className="text-xs text-muted-foreground">
                    {format.dateTime(new Date(log.createdAt), {
                      dateStyle: 'short',
                      timeStyle: 'medium',
                    })}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{log.action}</TableCell>
                  <TableCell className="max-w-48 truncate text-sm">
                    {log.actorEmail ?? log.actorKeycloakSub}
                  </TableCell>
                  <TableCell className="max-w-56 truncate font-mono text-xs text-muted-foreground">
                    {log.targetType}:{log.targetId}
                  </TableCell>
                  <TableCell>{resultBadge(log)}</TableCell>
                  <TableCell>
                    {log.requestId ? (
                      <span className="font-mono text-xs text-muted-foreground" title={log.requestId}>
                        {log.requestId.length > 10
                          ? `${log.requestId.slice(0, 10)}…`
                          : log.requestId}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{t('pagination.total', { total })}</span>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || logs.isLoading}
            onClick={() => setPage((p) => p - 1)}
          >
            {t('pagination.prev')}
          </Button>
          <span>{t('pagination.page', { page, pages })}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages || logs.isLoading}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('pagination.next')}
          </Button>
        </div>
      </div>

      {detail ? <AuditDetailDialog log={detail} onClose={() => setDetail(null)} /> : null}
    </div>
  )
}

function AuditDetailDialog({ log, onClose }: { log: AuditLogRow; onClose: () => void }) {
  const t = useTranslations('audit.detail')
  const tr = useTranslations('audit.result')
  const format = useFormatter()

  const jsonOf = (value: unknown) =>
    value === null || value === undefined ? null : JSON.stringify(value, null, 2)

  const rows: Array<{ label: string; value: ReactNode }> = [
    { label: t('action'), value: <span className="font-mono">{log.action}</span> },
    { label: t('actor'), value: log.actorEmail ?? log.actorKeycloakSub },
    {
      label: t('target'),
      value: (
        <span className="font-mono">
          {log.targetType}:{log.targetId}
        </span>
      ),
    },
    {
      label: t('result'),
      value: log.result === 'success' ? tr('success') : tr('failure'),
    },
    ...(log.failureReason ? [{ label: t('failureReason'), value: log.failureReason }] : []),
    {
      label: t('requestId'),
      value: log.requestId ? <span className="font-mono">{log.requestId}</span> : '—',
    },
    {
      label: t('time'),
      value: format.dateTime(new Date(log.createdAt), {
        dateStyle: 'medium',
        timeStyle: 'medium',
      }),
    },
  ]

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription className="font-mono text-xs">{log.id}</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
            {rows.map((row) => (
              <div key={row.label} className="contents">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="min-w-0 break-all text-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-foreground">{t('beforeData')}</p>
            {jsonOf(log.beforeData) ? (
              <pre className="max-h-52 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre-wrap break-all">
                {jsonOf(log.beforeData)}
              </pre>
            ) : (
              <p className="text-xs text-muted-foreground">{t('none')}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-foreground">{t('afterData')}</p>
            {jsonOf(log.afterData) ? (
              <pre className="max-h-52 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre-wrap break-all">
                {jsonOf(log.afterData)}
              </pre>
            ) : (
              <p className="text-xs text-muted-foreground">{t('none')}</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

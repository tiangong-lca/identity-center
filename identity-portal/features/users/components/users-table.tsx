'use client'

import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon, SearchIcon } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { useUsersQuery } from '@/features/users/queries'
import type { PortalUser, PortalUserStatus } from '@/features/users/types'
import {
  StatusToggleDialog,
  type StatusToggleAction,
  type StatusToggleTarget,
} from './status-toggle-dialog'
import { UserStatusBadge, UserSyncStatusBadge } from './user-badges'

const PAGE_SIZE = 20
type StatusFilter = 'all' | Extract<PortalUserStatus, 'active' | 'disabled'>

export function UsersTable() {
  const t = useTranslations('users.list')
  const ts = useTranslations('users.status')
  const tc = useTranslations('users.common')
  const locale = useLocale()

  const [page, setPage] = useState(1)
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [confirmTarget, setConfirmTarget] = useState<{
    user: StatusToggleTarget
    action: StatusToggleAction
  } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  function openConfirm(user: PortalUser) {
    setConfirmTarget({
      user,
      action: user.status === 'active' ? 'disable' : 'enable',
    })
    setConfirmOpen(true)
  }

  const query = useUsersQuery({
    page,
    pageSize: PAGE_SIZE,
    keyword: keyword || undefined,
    status: status === 'all' ? undefined : status,
  })

  const items = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setKeyword(keywordInput.trim())
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* FilterBar:状态筛选 + 关键字搜索(对齐原型信息密度) */}
      <form onSubmit={submitSearch} className="flex flex-wrap items-center gap-3">
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as StatusFilter)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-36" aria-label={t('statusFilterLabel')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('statusAll')}</SelectItem>
            <SelectItem value="active">{ts('active')}</SelectItem>
            <SelectItem value="disabled">{ts('disabled')}</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative w-full max-w-72">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={keywordInput}
            onChange={(event) => setKeywordInput(event.target.value)}
            placeholder={t('searchPlaceholder')}
            className="pl-8"
            aria-label={t('searchLabel')}
          />
        </div>
        <Button type="submit" variant="outline">
          {t('searchLabel')}
        </Button>
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="px-3">{t('columns.email')}</TableHead>
              <TableHead className="px-3">{t('columns.displayName')}</TableHead>
              <TableHead className="px-3">{t('columns.status')}</TableHead>
              <TableHead className="px-3">{t('columns.syncStatus')}</TableHead>
              <TableHead className="px-3">{t('columns.createdAt')}</TableHead>
              <TableHead className="w-16 px-3 text-right">{t('columns.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isPending ? (
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>
                  {Array.from({ length: 6 }).map((_, cell) => (
                    <TableCell key={cell} className="px-3 py-3">
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : query.isError ? (
              <TableRow>
                <TableCell colSpan={6} className="px-3 py-12 text-center">
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
                <TableCell colSpan={6} className="px-3 py-12 text-center text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              items.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="max-w-60 truncate px-3">
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {user.email}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-40 truncate px-3">
                    {user.displayName ? (
                      user.displayName
                    ) : (
                      <span className="text-muted-foreground">{tc('noName')}</span>
                    )}
                  </TableCell>
                  <TableCell className="px-3">
                    <UserStatusBadge status={user.status} />
                  </TableCell>
                  <TableCell className="px-3">
                    <UserSyncStatusBadge syncStatus={user.syncStatus} />
                  </TableCell>
                  <TableCell className="px-3 text-xs text-secondary-foreground">
                    {formatDateTime(user.createdAt, locale)}
                  </TableCell>
                  <TableCell className="px-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('rowActions.menuLabel')}
                        >
                          <MoreHorizontalIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-32">
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/users/${user.id}`}>{t('rowActions.view')}</Link>
                        </DropdownMenuItem>
                        {user.status === 'active' ? (
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => openConfirm(user)}
                          >
                            {t('rowActions.disable')}
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onSelect={() => openConfirm(user)}>
                            {t('rowActions.enable')}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* 分页条 */}
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <span className="text-xs text-muted-foreground">{t('total', { total })}</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page <= 1 || query.isPending}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              aria-label={t('prevPage')}
            >
              <ChevronLeftIcon />
            </Button>
            <span className="text-xs text-secondary-foreground">
              {t('pageInfo', { page, totalPages })}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page >= totalPages || query.isPending}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              aria-label={t('nextPage')}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      </div>

      <StatusToggleDialog
        user={confirmTarget?.user ?? null}
        action={confirmTarget?.action ?? 'disable'}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
      />
    </div>
  )
}

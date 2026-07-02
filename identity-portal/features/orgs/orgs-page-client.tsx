'use client'

import { PlusIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
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
import { OrgCreateDialog } from './org-create-dialog'
import { OrgManageDialog } from './org-manage-dialog'
import { ORG_PAGE_SIZE, ORG_TYPES, useOrgList, type PlatformOrg } from './queries'

const TYPE_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'ghost'> = {
  company: 'default',
  department: 'secondary',
  business_unit: 'outline',
  team: 'ghost',
}

export function OrgsPageClient() {
  const t = useTranslations('orgs')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [manageOrg, setManageOrg] = useState<PlatformOrg | null>(null)

  const orgs = useOrgList(page)
  const total = orgs.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / ORG_PAGE_SIZE))

  const typeLabel = (value: string) =>
    (ORG_TYPES as readonly string[]).includes(value)
      ? t(`type.${value as (typeof ORG_TYPES)[number]}`)
      : value

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          {t('create')}
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('table.code')}</TableHead>
              <TableHead>{t('table.name')}</TableHead>
              <TableHead>{t('table.type')}</TableHead>
              <TableHead>{t('table.status')}</TableHead>
              <TableHead className="text-right">{t('table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : orgs.isError ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-danger">
                  {t('loadFailed')}: {orgs.error.message}
                </TableCell>
              </TableRow>
            ) : (orgs.data?.items.length ?? 0) === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              orgs.data?.items.map((org) => (
                <TableRow key={org.id}>
                  <TableCell className="font-mono text-xs">{org.code}</TableCell>
                  <TableCell className="font-medium text-foreground">{org.name}</TableCell>
                  <TableCell>
                    <Badge variant={TYPE_BADGE_VARIANT[org.type] ?? 'outline'}>
                      {typeLabel(org.type)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {org.status === 'active' ? (
                      <Badge variant="outline" className="border-transparent bg-success/10 text-success">
                        {t('status.active')}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-transparent bg-muted text-muted-foreground">
                        {t('status.disabled')}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setManageOrg(org)}>
                      {t('manage')}
                    </Button>
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
            disabled={page <= 1 || orgs.isLoading}
            onClick={() => setPage((p) => p - 1)}
          >
            {t('pagination.prev')}
          </Button>
          <span>{t('pagination.page', { page, pages })}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages || orgs.isLoading}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('pagination.next')}
          </Button>
        </div>
      </div>

      <OrgCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      {manageOrg ? <OrgManageDialog org={manageOrg} onClose={() => setManageOrg(null)} /> : null}
    </div>
  )
}

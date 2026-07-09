// features/catalog/version-history.tsx
'use client'

import { useFormatter, useTranslations } from 'next-intl'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ApiClientError } from '@/features/shared/api'
import { useCatalogVersion, useCatalogVersions, useRollback, type CatalogVersion } from './queries'

const COLUMN_COUNT = 5

export function VersionHistory({
  currentVersion,
  onRolledBack,
}: {
  currentVersion: number
  onRolledBack: (version: number) => void
}) {
  const t = useTranslations('catalog')
  const format = useFormatter()
  const { data, isPending, isError, refetch } = useCatalogVersions()
  const rollback = useRollback()
  const [viewTarget, setViewTarget] = useState<number | null>(null)
  const [rollbackTarget, setRollbackTarget] = useState<CatalogVersion | null>(null)

  const viewQuery = useCatalogVersion(viewTarget)

  const handleRollback = (target: CatalogVersion) => {
    rollback.mutate(
      { version: target.version, expectedVersion: currentVersion },
      {
        onSuccess: (r) => {
          toast.success(t('applied', { version: r.version }))
          setRollbackTarget(null)
          onRolledBack(r.version)
        },
        onError: (e) => {
          if (e instanceof ApiClientError && e.code === 'CONFLICT') {
            toast.error(t('conflict'))
          } else {
            toast.error(e instanceof Error ? e.message : String(e))
          }
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-heading text-base font-medium">{t('versions.title')}</h2>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('versions.version')}</TableHead>
              <TableHead>{t('versions.appliedBy')}</TableHead>
              <TableHead>{t('versions.source')}</TableHead>
              <TableHead>{t('versions.appliedAt')}</TableHead>
              <TableHead className="text-right">{t('versions.view')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: 3 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={COLUMN_COUNT}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="py-8 text-center">
                  <span className="text-muted-foreground">{t('versions.loadFailed')}</span>
                  <Button variant="link" size="sm" className="ml-2" onClick={() => refetch()}>
                    {t('reload')}
                  </Button>
                </TableCell>
              </TableRow>
            ) : data && data.items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-8 text-center text-muted-foreground"
                >
                  {t('versions.empty')}
                </TableCell>
              </TableRow>
            ) : (
              data?.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">v{item.version}</TableCell>
                  <TableCell className="text-secondary-foreground">{item.appliedBy}</TableCell>
                  <TableCell className="text-secondary-foreground">{item.source}</TableCell>
                  <TableCell className="text-secondary-foreground">
                    {format.dateTime(new Date(item.appliedAt), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setViewTarget(item.version)}>
                      {t('versions.view')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger hover:text-danger"
                      disabled={rollback.isPending || item.version === currentVersion}
                      onClick={() => setRollbackTarget(item)}
                    >
                      {t('versions.rollback')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={viewTarget !== null}
        onOpenChange={(open) => (!open ? setViewTarget(null) : undefined)}
      >
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {viewTarget !== null ? `${t('versions.version')} v${viewTarget}` : t('versions.title')}
            </DialogTitle>
          </DialogHeader>
          {viewQuery.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : viewQuery.isError ? (
            <p className="text-sm text-muted-foreground">{t('versions.loadFailed')}</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <p className="mb-1 text-sm font-medium">{t('title')}</p>
                <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {viewQuery.data?.yaml}
                </pre>
              </div>
              {viewQuery.data?.diff != null && (
                <div>
                  <p className="mb-1 text-sm font-medium">{t('diffTitle')}</p>
                  <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
                    {JSON.stringify(viewQuery.data.diff, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={rollbackTarget !== null}
        onOpenChange={(open) => (!open ? setRollbackTarget(null) : undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('versions.rollback')}</AlertDialogTitle>
            <AlertDialogDescription>
              {rollbackTarget
                ? t('versions.rollbackConfirm', { version: rollbackTarget.version })
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rollback.isPending}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={rollback.isPending}
              onClick={() => {
                if (rollbackTarget) handleRollback(rollbackTarget)
              }}
            >
              {t('versions.rollback')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

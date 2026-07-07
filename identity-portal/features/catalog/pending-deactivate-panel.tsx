// features/catalog/pending-deactivate-panel.tsx
'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ApiClientError } from '@/features/shared/api'
import { usePendingDeactivate, useConfirmDeactivate, type PendingDeactivateItem } from './queries'

export function PendingDeactivatePanel() {
  const t = useTranslations('catalog')
  const { data, isPending, isError } = usePendingDeactivate()
  const confirm = useConfirmDeactivate()
  const [target, setTarget] = useState<PendingDeactivateItem | null>(null)

  if (isPending) return <div className="h-24 animate-pulse rounded bg-muted" />
  if (isError) return <Card className="p-3 text-sm text-danger">{t('pendingDeactivate.loadFailed')}</Card>

  const items = data?.items ?? []
  const onConfirm = () => {
    if (!target) return
    const name = target.name
    confirm.mutate(
      { appCode: target.appCode, roleCode: target.roleCode },
      {
        onSuccess: () => { toast.success(t('pendingDeactivate.done', { name })); setTarget(null) },
        onError: (e) => toast.error(e instanceof ApiClientError ? e.message : String(e)),
      },
    )
  }

  return (
    <Card className="p-3">
      <p className="mb-2 text-sm font-medium">{t('pendingDeactivate.title')}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('pendingDeactivate.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li key={`${it.kind}:${it.appCode}:${it.roleCode ?? ''}`} className="flex items-center justify-between gap-2 text-sm">
              <span>
                <span className="text-muted-foreground">{t(`pendingDeactivate.${it.kind}`)}</span>{' '}
                <code>{it.appCode}{it.roleCode ? `/${it.roleCode}` : ''}</code> — {it.name}{' '}
                <span className="text-xs text-muted-foreground">{t('pendingDeactivate.affected', { count: it.affectedAssignments })}</span>
              </span>
              <Button variant="outline" size="sm" onClick={() => setTarget(it)}>
                {t('pendingDeactivate.confirm')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <AlertDialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('pendingDeactivate.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {target && t('pendingDeactivate.confirmBody', { name: target.name, count: target.affectedAssignments })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm} disabled={confirm.isPending}>
              {t('pendingDeactivate.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

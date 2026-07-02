'use client'

import { useTranslations } from 'next-intl'
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
import { apiErrorMessage } from '@/features/users/format'
import { useSetUserStatusMutation } from '@/features/users/queries'
import type { PortalUser } from '@/features/users/types'

export type StatusToggleTarget = Pick<PortalUser, 'id' | 'email'>

export type StatusToggleAction = 'disable' | 'enable'

/** 禁用/启用二次确认(列表行内与详情危险区共用;action 由触发方在点击时捕获,避免关闭动画期间文案翻转) */
export function StatusToggleDialog({
  user,
  action,
  open,
  onOpenChange,
}: {
  user: StatusToggleTarget | null
  action: StatusToggleAction
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('users.danger')
  const tc = useTranslations('users.common')
  const mutation = useSetUserStatusMutation()

  function confirm(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    if (!user || mutation.isPending) return
    mutation.mutate(
      { id: user.id, action },
      {
        onSuccess: () => {
          toast.success(t(`${action}.success`))
          onOpenChange(false)
        },
        onError: (error) => {
          toast.error(apiErrorMessage(error, tc('requestFailed')))
        },
      },
    )
  }

  return (
    <AlertDialog open={open && user !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(`${action}.confirmTitle`)}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(`${action}.confirmDescription`, { email: user?.email ?? '' })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant={action === 'disable' ? 'destructive' : 'default'}
            disabled={mutation.isPending}
            onClick={confirm}
          >
            {mutation.isPending ? t('processing') : t(`${action}.action`)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

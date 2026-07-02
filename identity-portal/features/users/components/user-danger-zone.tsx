'use client'

import { useTranslations } from 'next-intl'
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { apiErrorMessage } from '@/features/users/format'
import { useResetMfaMutation, useResetPasswordMutation } from '@/features/users/queries'
import type { PortalUser } from '@/features/users/types'
import { StatusToggleDialog, type StatusToggleAction } from './status-toggle-dialog'

const MIN_PASSWORD_LENGTH = 10

function DangerRow({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/** 危险操作区:禁用/启用、重置密码、重置 MFA(全部二次确认) */
export function UserDangerZone({ user }: { user: PortalUser }) {
  const t = useTranslations('users.danger')
  const tc = useTranslations('users.common')

  const [statusOpen, setStatusOpen] = useState(false)
  const [statusDialogAction, setStatusDialogAction] = useState<StatusToggleAction>('disable')
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [mfaOpen, setMfaOpen] = useState(false)
  const [temporaryPassword, setTemporaryPassword] = useState('')

  const resetPassword = useResetPasswordMutation()
  const resetMfa = useResetMfaMutation()

  const isActive = user.status === 'active'
  const statusAction: StatusToggleAction = isActive ? 'disable' : 'enable'

  function openStatusDialog() {
    setStatusDialogAction(statusAction)
    setStatusOpen(true)
  }

  function onPasswordOpenChange(next: boolean) {
    setPasswordOpen(next)
    if (!next) setTemporaryPassword('')
  }

  function submitResetPassword() {
    if (temporaryPassword.length < MIN_PASSWORD_LENGTH || resetPassword.isPending) return
    resetPassword.mutate(
      { id: user.id, temporaryPassword },
      {
        onSuccess: () => {
          toast.success(t('resetPassword.success'))
          onPasswordOpenChange(false)
        },
        onError: (error) => {
          toast.error(apiErrorMessage(error, tc('requestFailed')))
        },
      },
    )
  }

  function confirmResetMfa(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    if (resetMfa.isPending) return
    resetMfa.mutate(
      { id: user.id },
      {
        onSuccess: () => {
          toast.success(t('resetMfa.success'))
          setMfaOpen(false)
        },
        onError: (error) => {
          toast.error(apiErrorMessage(error, tc('requestFailed')))
        },
      },
    )
  }

  return (
    <Card className="ring-danger/40">
      <CardHeader>
        <CardTitle className="text-danger">{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <DangerRow title={t(`${statusAction}.action`)} hint={t(`${statusAction}.hint`)}>
          <Button
            variant={isActive ? 'destructive' : 'outline'}
            size="sm"
            onClick={openStatusDialog}
          >
            {t(`${statusAction}.action`)}
          </Button>
        </DangerRow>
        <Separator />
        <DangerRow title={t('resetPassword.action')} hint={t('resetPassword.hint')}>
          <Button variant="outline" size="sm" onClick={() => onPasswordOpenChange(true)}>
            {t('resetPassword.action')}
          </Button>
        </DangerRow>
        <Separator />
        <DangerRow title={t('resetMfa.action')} hint={t('resetMfa.hint')}>
          <Button variant="outline" size="sm" onClick={() => setMfaOpen(true)}>
            {t('resetMfa.action')}
          </Button>
        </DangerRow>
      </CardContent>

      {/* 禁用/启用确认 */}
      <StatusToggleDialog
        user={user}
        action={statusDialogAction}
        open={statusOpen}
        onOpenChange={setStatusOpen}
      />

      {/* 重置密码:输入临时密码 */}
      <Dialog open={passwordOpen} onOpenChange={onPasswordOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('resetPassword.dialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('resetPassword.dialogDescription', { email: user.email })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reset-temporary-password">{t('resetPassword.passwordLabel')}</Label>
            <Input
              id="reset-temporary-password"
              value={temporaryPassword}
              onChange={(event) => setTemporaryPassword(event.target.value)}
              autoComplete="off"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              {t('resetPassword.passwordHint', { min: MIN_PASSWORD_LENGTH })}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onPasswordOpenChange(false)}
              disabled={resetPassword.isPending}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={submitResetPassword}
              disabled={temporaryPassword.length < MIN_PASSWORD_LENGTH || resetPassword.isPending}
            >
              {resetPassword.isPending ? t('processing') : t('resetPassword.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 重置 MFA 确认 */}
      <AlertDialog open={mfaOpen} onOpenChange={setMfaOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('resetMfa.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('resetMfa.confirmDescription', { email: user.email })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetMfa.isPending}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={resetMfa.isPending}
              onClick={confirmResetMfa}
            >
              {resetMfa.isPending ? t('processing') : t('resetMfa.action')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

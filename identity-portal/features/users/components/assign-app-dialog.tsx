'use client'

import { PlusIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { apiErrorMessage } from '@/features/users/format'
import { useApplicationsQuery, useAssignApplicationMutation } from '@/features/users/queries'
import type { PortalUser } from '@/features/users/types'

/** 分配应用准入:选应用 → POST assignments(201 已投影 / 202 同步中) */
export function AssignAppDialog({ user }: { user: PortalUser }) {
  const t = useTranslations('users.assign')
  const tc = useTranslations('users.common')
  const [open, setOpen] = useState(false)
  const [applicationId, setApplicationId] = useState('')
  const applications = useApplicationsQuery(open)
  const assign = useAssignApplicationMutation()

  const apps = applications.data?.items ?? []

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setApplicationId('')
  }

  function submit() {
    if (!applicationId || assign.isPending) return
    assign.mutate(
      { applicationId, portalUserId: user.id },
      {
        onSuccess: (result) => {
          toast.success(
            result.projection === 'projected' ? t('successProjected') : t('successPending'),
          )
          onOpenChange(false)
        },
        onError: (error) => {
          toast.error(apiErrorMessage(error, tc('requestFailed')))
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button disabled={user.status !== 'active'}>
          <PlusIcon data-icon="inline-start" />
          {t('assignApp')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('dialogTitle')}</DialogTitle>
          <DialogDescription>{t('dialogDescription', { email: user.email })}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="assign-app-select">{t('selectApp')}</Label>
          <Select
            value={applicationId}
            onValueChange={setApplicationId}
            disabled={applications.isPending}
          >
            <SelectTrigger id="assign-app-select" className="w-full">
              <SelectValue
                placeholder={applications.isPending ? t('loadingApps') : t('selectPlaceholder')}
              />
            </SelectTrigger>
            <SelectContent>
              {apps.map((app) => (
                <SelectItem key={app.id} value={app.id}>
                  {app.name}
                  <span className="text-xs text-muted-foreground">{app.code}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {applications.isError ? (
            <p className="text-xs text-danger">{t('loadAppsFailed')}</p>
          ) : null}
          {applications.isSuccess && apps.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('noApps')}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={assign.isPending}>
            {t('cancel')}
          </Button>
          <Button onClick={submit} disabled={!applicationId || assign.isPending}>
            {assign.isPending ? t('assigning') : t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

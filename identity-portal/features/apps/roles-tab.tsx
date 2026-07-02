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
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Textarea } from '@/components/ui/textarea'
import { ApiClientError } from '@/features/shared/api'
import {
  useAppRoles,
  useCreateAppRole,
  useUpdateAppRole,
  type ApplicationRole,
  type ApplicationStatus,
} from './queries'
import { AppStatusBadge } from './status-badges'

const ROLE_CODE_PATTERN = /^[a-z0-9_]{1,50}$/
const COLUMN_COUNT = 5

function useFailedToast() {
  const t = useTranslations('apps.toast')
  return (error: unknown) =>
    toast.error(
      t('failed', { message: error instanceof ApiClientError ? error.message : String(error) }),
    )
}

function RoleFormDialog({
  appId,
  role,
  open,
  onOpenChange,
}: {
  appId: string
  /** null=新建;非 null=编辑 */
  role: ApplicationRole | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('apps.detail.roles')
  const tToast = useTranslations('apps.toast')
  const failedToast = useFailedToast()
  const [error, setError] = useState<string | null>(null)
  const create = useCreateAppRole(appId)
  const update = useUpdateAppRole(appId)
  const busy = create.isPending || update.isPending

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const value = (name: string) => String(fd.get(name) ?? '').trim()
    const name = value('name')
    if (!name) {
      setError(t('requiredMissing'))
      return
    }
    if (role) {
      setError(null)
      update.mutate(
        {
          roleId: role.id,
          name,
          description: value('description') || undefined,
          status: (value('status') || role.status) as ApplicationStatus,
        },
        {
          onSuccess: () => {
            toast.success(tToast('roleUpdated'))
            onOpenChange(false)
          },
          onError: failedToast,
        },
      )
      return
    }
    const code = value('code')
    if (!code) {
      setError(t('requiredMissing'))
      return
    }
    if (!ROLE_CODE_PATTERN.test(code)) {
      setError(t('codeInvalid'))
      return
    }
    setError(null)
    create.mutate(
      { code, name, description: value('description') || undefined },
      {
        onSuccess: (created) => {
          toast.success(tToast('roleCreated', { code: created.code }))
          onOpenChange(false)
        },
        onError: failedToast,
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{role ? t('editTitle') : t('createTitle')}</DialogTitle>
          <DialogDescription>
            {role ? t('editDescription') : t('createDescription')}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          {role ? (
            <div className="flex flex-col gap-1.5">
              <Label>{t('code')}</Label>
              <p className="font-mono text-sm text-muted-foreground">{role.code}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role-code">{t('code')}</Label>
              <Input id="role-code" name="code" placeholder={t('codePlaceholder')} />
              <p className="text-xs text-muted-foreground">{t('codeHint')}</p>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role-name">{t('name')}</Label>
            <Input id="role-name" name="name" defaultValue={role?.name ?? ''} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role-description">{t('description')}</Label>
            <Textarea
              id="role-description"
              name="description"
              maxLength={300}
              defaultValue={role?.description ?? ''}
            />
          </div>
          {role ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role-status">{t('status')}</Label>
              <Select name="status" defaultValue={role.status}>
                <SelectTrigger id="role-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t('statusValue.active')}</SelectItem>
                  <SelectItem value="disabled">{t('statusValue.disabled')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {role ? t('submitSave') : t('submitCreate')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function RolesTab({ appId }: { appId: string }) {
  const t = useTranslations('apps.detail.roles')
  const tApps = useTranslations('apps')
  const { data, isPending, isError, refetch } = useAppRoles(appId)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ApplicationRole | null>(null)

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (role: ApplicationRole) => {
    setEditing(role)
    setDialogOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <PlusIcon data-icon="inline-start" />
          {t('create')}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('code')}</TableHead>
              <TableHead>{t('name')}</TableHead>
              <TableHead>{t('description')}</TableHead>
              <TableHead>{t('status')}</TableHead>
              <TableHead className="text-right">{t('actions')}</TableHead>
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
                  <span className="text-muted-foreground">{t('loadFailed')}</span>
                  <Button variant="link" size="sm" className="ml-2" onClick={() => refetch()}>
                    {tApps('table.retry')}
                  </Button>
                </TableCell>
              </TableRow>
            ) : data && data.items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-8 text-center text-muted-foreground"
                >
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              data?.items.map((role) => (
                <TableRow key={role.id}>
                  <TableCell>
                    <span className="font-mono text-xs text-foreground">{role.code}</span>
                  </TableCell>
                  <TableCell className="font-medium text-foreground">{role.name}</TableCell>
                  <TableCell>
                    <span
                      className="block max-w-64 truncate text-secondary-foreground"
                      title={role.description ?? undefined}
                    >
                      {role.description ?? tApps('detail.none')}
                    </span>
                  </TableCell>
                  <TableCell>
                    <AppStatusBadge status={role.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-primary hover:text-primary"
                      onClick={() => openEdit(role)}
                    >
                      {t('edit')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <RoleFormDialog
        key={editing?.id ?? 'create'}
        appId={appId}
        role={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  )
}

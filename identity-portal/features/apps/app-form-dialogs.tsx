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
import { ApiClientError } from '@/features/shared/api'
import {
  useCreateApplication,
  useUpdateApplication,
  type Application,
  type ApplicationStatus,
} from './queries'

const CODE_PATTERN = /^[a-z0-9-]{2,50}$/

function useFailedToast() {
  const t = useTranslations('apps.toast')
  return (error: unknown) =>
    toast.error(
      t('failed', { message: error instanceof ApiClientError ? error.message : String(error) }),
    )
}

function readForm(form: HTMLFormElement) {
  const fd = new FormData(form)
  return (name: string) => String(fd.get(name) ?? '').trim()
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

/** 登记应用 Dialog(全字段) */
export function CreateAppDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('apps.form')
  const tToast = useTranslations('apps.toast')
  const failedToast = useFailedToast()
  const [error, setError] = useState<string | null>(null)
  const create = useCreateApplication()

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const value = readForm(e.currentTarget)
    const code = value('code')
    const name = value('name')
    const keycloakClientId = value('keycloakClientId')
    if (!code || !name || !keycloakClientId) {
      setError(t('requiredMissing'))
      return
    }
    if (!CODE_PATTERN.test(code)) {
      setError(t('codeInvalid'))
      return
    }
    setError(null)
    create.mutate(
      {
        code,
        name,
        keycloakClientId,
        accessClientRole: value('accessClientRole') || undefined,
        loginUrl: value('loginUrl') || undefined,
        adminUrl: value('adminUrl') || undefined,
        webhookUrl: value('webhookUrl') || undefined,
        webhookSecretRef: value('webhookSecretRef') || undefined,
      },
      {
        onSuccess: (app) => {
          toast.success(tToast('created', { name: app.name }))
          onOpenChange(false)
        },
        onError: failedToast,
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('createTitle')}</DialogTitle>
          <DialogDescription>{t('createDescription')}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="app-code" label={t('code')} hint={t('codeHint')}>
              <Input id="app-code" name="code" placeholder={t('codePlaceholder')} />
            </Field>
            <Field id="app-name" label={t('name')}>
              <Input id="app-name" name="name" placeholder={t('namePlaceholder')} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="app-client-id"
              label={t('keycloakClientId')}
              hint={t('keycloakClientIdHint')}
            >
              <Input
                id="app-client-id"
                name="keycloakClientId"
                placeholder={t('keycloakClientIdPlaceholder')}
              />
            </Field>
            <Field
              id="app-access-role"
              label={`${t('accessClientRole')}(${t('optional')})`}
              hint={t('accessClientRoleHint')}
            >
              <Input
                id="app-access-role"
                name="accessClientRole"
                placeholder={t('accessClientRolePlaceholder')}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="app-login-url" label={`${t('loginUrl')}(${t('optional')})`}>
              <Input id="app-login-url" name="loginUrl" placeholder="https://" />
            </Field>
            <Field id="app-admin-url" label={`${t('adminUrl')}(${t('optional')})`}>
              <Input id="app-admin-url" name="adminUrl" placeholder="https://" />
            </Field>
          </div>
          <Field
            id="app-webhook-url"
            label={`${t('webhookUrl')}(${t('optional')})`}
            hint={t('webhookUrlHint')}
          >
            <Input id="app-webhook-url" name="webhookUrl" placeholder="https://" />
          </Field>
          <Field
            id="app-webhook-secret-ref"
            label={`${t('webhookSecretRef')}(${t('optional')})`}
            hint={t('webhookSecretRefHint')}
          >
            <Input
              id="app-webhook-secret-ref"
              name="webhookSecretRef"
              placeholder="APP_EXAMPLE_WEBHOOK_SECRET"
            />
          </Field>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** 编辑基础信息 Dialog(PATCH) */
export function EditAppDialog({
  app,
  open,
  onOpenChange,
}: {
  app: Application
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('apps.form')
  const tBasic = useTranslations('apps.detail.basic')
  const tStatus = useTranslations('apps.status')
  const tToast = useTranslations('apps.toast')
  const failedToast = useFailedToast()
  const [error, setError] = useState<string | null>(null)
  const update = useUpdateApplication(app.id)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const value = readForm(e.currentTarget)
    const name = value('name')
    if (!name) {
      setError(t('requiredMissing'))
      return
    }
    setError(null)
    update.mutate(
      {
        name,
        status: (value('status') || app.status) as ApplicationStatus,
        loginUrl: value('loginUrl') || undefined,
        adminUrl: value('adminUrl') || undefined,
        webhookUrl: value('webhookUrl') || undefined,
        webhookSecretRef: value('webhookSecretRef') || undefined,
      },
      {
        onSuccess: () => {
          toast.success(tToast('updated'))
          onOpenChange(false)
        },
        onError: failedToast,
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('editTitle')}</DialogTitle>
          <DialogDescription>{t('editDescription')}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="edit-name" label={t('name')}>
              <Input id="edit-name" name="name" defaultValue={app.name} />
            </Field>
            <Field id="edit-status" label={t('status')}>
              <Select name="status" defaultValue={app.status}>
                <SelectTrigger id="edit-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{tStatus('active')}</SelectItem>
                  <SelectItem value="disabled">{tStatus('disabled')}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="edit-login-url" label={`${t('loginUrl')}(${t('optional')})`}>
              <Input
                id="edit-login-url"
                name="loginUrl"
                defaultValue={app.loginUrl ?? ''}
                placeholder="https://"
              />
            </Field>
            <Field id="edit-admin-url" label={`${t('adminUrl')}(${t('optional')})`}>
              <Input
                id="edit-admin-url"
                name="adminUrl"
                defaultValue={app.adminUrl ?? ''}
                placeholder="https://"
              />
            </Field>
          </div>
          <Field
            id="edit-webhook-url"
            label={`${t('webhookUrl')}(${t('optional')})`}
            hint={t('webhookUrlHint')}
          >
            <Input
              id="edit-webhook-url"
              name="webhookUrl"
              defaultValue={app.webhookUrl ?? ''}
              placeholder="https://"
            />
          </Field>
          <Field
            id="edit-webhook-secret-ref"
            label={`${t('webhookSecretRef')}(${t('optional')})`}
            hint={t('webhookSecretRefHint')}
          >
            <Input
              id="edit-webhook-secret-ref"
              name="webhookSecretRef"
              defaultValue={app.webhookSecretRef ?? ''}
            />
          </Field>
          <p className="text-xs text-muted-foreground">{tBasic('clearHint')}</p>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

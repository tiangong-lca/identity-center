'use client'

import { PlusIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { BindAdminCard } from './bind-admin-card'
import {
  useAdminRoles,
  useCreateAdminRole,
  useDeleteAdminRole,
  type AdminRole,
} from './queries'
import { RolePermissionMatrix } from './role-permission-matrix'

export function RolesPageClient() {
  const t = useTranslations('roles')
  const roles = useAdminRoles()
  const deleteRole = useDeleteAdminRole()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const items = roles.data?.items ?? []
  // 无显式选择(或所选角色已被删除)时回退到第一项,纯派生避免 effect 级联渲染
  const selected = items.find((r) => r.id === selectedId) ?? items[0] ?? null

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* 左:管理角色列表 */}
      <Card>
        <CardHeader>
          <CardTitle>{t('rolesList')}</CardTitle>
          <div className="pt-1">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              {t('createRole')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          {roles.isLoading ? (
            <>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </>
          ) : roles.isError ? (
            <p className="text-sm text-danger">
              {t('loadFailed')}: {roles.error.message}
            </p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('listEmpty')}</p>
          ) : (
            items.map((role) => (
              <RoleListItem
                key={role.id}
                role={role}
                active={role.id === selected?.id}
                onSelect={() => setSelectedId(role.id)}
                onDelete={() =>
                  deleteRole.mutate(role.id, {
                    onSuccess: () => {
                      if (selectedId === role.id) setSelectedId(null)
                    },
                  })
                }
              />
            ))
          )}
          {deleteRole.isError ? (
            <p className="text-xs text-danger">
              {t('errorPrefix')}: {deleteRole.error.message}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* 右:权限矩阵 + 绑定管理员 */}
      <div className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>
              {t('permissionsTitle')}
              {selected ? (
                <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                  {selected.code}
                </span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selected ? (
              <RolePermissionMatrix role={selected} />
            ) : (
              <p className="text-sm text-muted-foreground">{t('selectRoleHint')}</p>
            )}
          </CardContent>
        </Card>

        <BindAdminCard />
      </div>

      <RoleCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

function RoleListItem({
  role,
  active,
  onSelect,
  onDelete,
}: {
  role: AdminRole
  active: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const t = useTranslations('roles')

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
        active ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'
      }`}
    >
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect}>
        <p className="truncate text-sm font-medium text-foreground">{role.name}</p>
        <p className="truncate font-mono text-xs text-muted-foreground">{role.code}</p>
      </button>
      {role.builtIn ? (
        <Badge variant="secondary">{t('builtIn')}</Badge>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="xs">
              {t('deleteRole')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('deleteConfirmTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('deleteConfirmDesc', { name: role.name })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onDelete}>
                {t('deleteConfirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}

function RoleCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('roles')
  const createRole = useCreateAdminRole()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [validationError, setValidationError] = useState(false)

  const reset = () => {
    setCode('')
    setName('')
    setDescription('')
    setValidationError(false)
    createRole.reset()
  }

  const submit = () => {
    if (!code.trim() || !name.trim()) {
      setValidationError(true)
      return
    }
    setValidationError(false)
    createRole.mutate(
      {
        code: code.trim(),
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
      },
      {
        onSuccess: () => {
          reset()
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('createDialog.title')}</DialogTitle>
          <DialogDescription>{t('createDialog.description')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role-code">{t('createDialog.code')}</Label>
            <Input
              id="role-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('createDialog.codePlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role-name">{t('createDialog.name')}</Label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('createDialog.namePlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role-description">{t('createDialog.descriptionLabel')}</Label>
            <Textarea
              id="role-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('createDialog.descriptionPlaceholder')}
              rows={3}
            />
          </div>
          {validationError ? (
            <p className="text-xs text-danger">{t('createDialog.required')}</p>
          ) : null}
          {createRole.isError ? (
            <p className="text-xs text-danger">
              {t('errorPrefix')}: {createRole.error.message}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t('cancel')}</Button>
          </DialogClose>
          <Button onClick={submit} disabled={createRole.isPending}>
            {t('createDialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

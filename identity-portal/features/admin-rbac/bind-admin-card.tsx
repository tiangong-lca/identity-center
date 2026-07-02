'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { type PortalUserOption } from '@/features/shared/lookups'
import { UserPicker } from '@/features/shared/user-picker'
import {
  SCOPE_TYPES,
  useAdminRoles,
  useBindAdminUser,
  useUnbindAdminUser,
  type AdminUserRoleBinding,
  type ScopeType,
} from './queries'

/** 绑定管理员:用户搜索 + 角色 + scope 类型/ID → POST admin-user-roles */
export function BindAdminCard() {
  const t = useTranslations('roles.bind')
  const te = useTranslations('roles')
  const roles = useAdminRoles()
  const bind = useBindAdminUser()
  const unbind = useUnbindAdminUser()

  const [pickedUser, setPickedUser] = useState<PortalUserOption | null>(null)
  const [roleId, setRoleId] = useState<string>('')
  const [scopeType, setScopeType] = useState<ScopeType>('global')
  const [scopeId, setScopeId] = useState('')
  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const [lastBinding, setLastBinding] = useState<AdminUserRoleBinding | null>(null)

  const submit = () => {
    if (!pickedUser || !roleId) {
      setValidationMessage(t('required'))
      return
    }
    if (scopeType !== 'global' && !scopeId.trim()) {
      setValidationMessage(t('scopeIdRequired'))
      return
    }
    setValidationMessage(null)
    bind.mutate(
      {
        portalUserId: pickedUser.id,
        adminRoleId: roleId,
        scopeType,
        ...(scopeType !== 'global' ? { scopeId: scopeId.trim() } : {}),
      },
      {
        onSuccess: (row) => {
          setLastBinding(row)
          setPickedUser(null)
          setScopeId('')
          unbind.reset()
        },
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('hint')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>{t('user')}</Label>
          <UserPicker
            value={pickedUser}
            onChange={setPickedUser}
            labels={{
              placeholder: t('userPickerPlaceholder'),
              empty: t('userPickerEmpty'),
              searching: t('userPickerSearching'),
            }}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>{t('role')}</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('rolePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {(roles.data?.items ?? []).map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}({role.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('scopeType')}</Label>
            <Select
              value={scopeType}
              onValueChange={(v) => {
                setScopeType(v as ScopeType)
                if (v === 'global') setScopeId('')
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCOPE_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`scope.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('scopeId')}</Label>
            <Input
              value={scopeId}
              onChange={(e) => setScopeId(e.target.value)}
              placeholder={t('scopeIdPlaceholder')}
              disabled={scopeType === 'global'}
            />
          </div>
        </div>

        {validationMessage ? <p className="text-xs text-danger">{validationMessage}</p> : null}
        {bind.isError ? (
          <p className="text-xs text-danger">
            {te('errorPrefix')}: {bind.error.message}
          </p>
        ) : null}
        {unbind.isError ? (
          <p className="text-xs text-danger">
            {te('errorPrefix')}: {unbind.error.message}
          </p>
        ) : null}

        {lastBinding ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-success/10 px-3 py-2">
            <p className="min-w-0 truncate text-xs text-success">
              {t('success')} <span className="font-mono">{lastBinding.id}</span>
            </p>
            <Button
              variant="destructive"
              size="xs"
              disabled={unbind.isPending}
              onClick={() =>
                unbind.mutate(lastBinding.id, { onSuccess: () => setLastBinding(null) })
              }
            >
              {t('unbind')}
            </Button>
          </div>
        ) : null}

        <div>
          <Button onClick={submit} disabled={bind.isPending}>
            {t('submit')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

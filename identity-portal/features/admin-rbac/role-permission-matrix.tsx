'use client'

import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  PERMISSION_GROUP_ORDER,
  PLATFORM_ADMIN_CODE,
  useAdminPermissions,
  useGrantPermission,
  useRevokePermission,
  useRolePermissions,
  type AdminPermission,
  type AdminRole,
} from './queries'

const OTHER_GROUP = 'other'

/** 23 权限按 code 前缀分组的勾选矩阵;platform_admin 只读展示全部权限 */
export function RolePermissionMatrix({ role }: { role: AdminRole }) {
  const t = useTranslations('roles')
  const permissions = useAdminPermissions()
  const rolePermissions = useRolePermissions(role.id)
  const grant = useGrantPermission(role.id)
  const revoke = useRevokePermission(role.id)

  const isPlatformAdmin = role.code === PLATFORM_ADMIN_CODE
  const mutating = grant.isPending || revoke.isPending

  const granted = useMemo(
    () => new Set((rolePermissions.data?.items ?? []).map((rp) => rp.adminPermissionId)),
    [rolePermissions.data],
  )

  const groups = useMemo(() => {
    const byPrefix = new Map<string, AdminPermission[]>()
    for (const perm of permissions.data?.items ?? []) {
      const prefix = perm.code.includes(':') ? perm.code.split(':')[0] : OTHER_GROUP
      const bucket = byPrefix.get(prefix) ?? []
      bucket.push(perm)
      byPrefix.set(prefix, bucket)
    }
    const ordered: Array<{ group: string; items: AdminPermission[] }> = []
    for (const group of PERMISSION_GROUP_ORDER) {
      const items = byPrefix.get(group)
      if (items) {
        ordered.push({ group, items })
        byPrefix.delete(group)
      }
    }
    for (const [group, items] of byPrefix) ordered.push({ group, items })
    return ordered
  }, [permissions.data])

  const groupLabel = (group: string) =>
    (PERMISSION_GROUP_ORDER as readonly string[]).includes(group)
      ? t(`groups.${group as (typeof PERMISSION_GROUP_ORDER)[number]}`)
      : t('groups.other')

  if (permissions.isLoading || rolePermissions.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (permissions.isError || rolePermissions.isError) {
    return (
      <p className="text-sm text-danger">
        {t('loadFailed')}:{' '}
        {(permissions.error ?? rolePermissions.error)?.message}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {isPlatformAdmin ? (
        <div className="rounded-lg border border-border bg-primary/5 px-3 py-2">
          <p className="text-sm font-medium text-primary">{t('allPermissions')}</p>
          <p className="text-xs text-muted-foreground">{t('allPermissionsDesc')}</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t('permissionsHint')}</p>
      )}

      {(grant.isError || revoke.isError) && !isPlatformAdmin ? (
        <p className="text-xs text-danger">
          {t('errorPrefix')}: {(grant.error ?? revoke.error)?.message}
        </p>
      ) : null}

      {groups.map(({ group, items }) => (
        <section key={group} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-foreground">{groupLabel(group)}</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((perm) => {
              const checked = isPlatformAdmin || granted.has(perm.id)
              return (
                <label
                  key={perm.id}
                  className={`flex items-start gap-2 rounded-lg border border-border px-2.5 py-2 ${
                    isPlatformAdmin ? 'opacity-80' : 'cursor-pointer hover:bg-accent'
                  }`}
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={checked}
                    disabled={isPlatformAdmin || mutating}
                    onCheckedChange={(next) => {
                      if (next === true) grant.mutate(perm.id)
                      else revoke.mutate(perm.id)
                    }}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-mono text-xs text-foreground">{perm.code}</span>
                    <span className="truncate text-xs text-muted-foreground">{perm.name}</span>
                  </span>
                </label>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

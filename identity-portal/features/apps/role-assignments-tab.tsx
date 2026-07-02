import { PlusIcon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
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
import { ApiClientError } from '@/features/shared/api'
import {
  useAppRoles,
  useAssignRole,
  useRevokeRoleAssignment,
  useRoleAssignments,
  type ApplicationUserRole,
  type PortalUserOption,
  type ScopeType,
} from './queries'
import { AssignmentStatusBadge, ProjectionBadge } from './status-badges'
import { UserPicker } from './user-picker'

const SCOPE_TYPES: ScopeType[] = ['global', 'tenant', 'org', 'team', 'project']
const COLUMN_COUNT = 7

function AssignRoleDialog({
  appId,
  open,
  onOpenChange,
}: {
  appId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('apps.detail.roleAssignments')
  const tToast = useTranslations('apps.toast')
  const { data: rolesData } = useAppRoles(appId)
  const activeRoles = (rolesData?.items ?? []).filter((role) => role.status === 'active')

  const [roleId, setRoleId] = useState('')
  const [user, setUser] = useState<PortalUserOption | null>(null)
  const [scopeType, setScopeType] = useState<ScopeType>('global')
  const [scopeId, setScopeId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const assign = useAssignRole(appId)

  const reset = () => {
    setRoleId('')
    setUser(null)
    setScopeType('global')
    setScopeId('')
    setError(null)
  }

  const handleSubmit = () => {
    if (!roleId || !user) {
      setError(t('requiredMissing'))
      return
    }
    setError(null)
    assign.mutate(
      {
        applicationRoleId: roleId,
        portalUserId: user.id,
        scopeType,
        scopeId: scopeType === 'global' ? undefined : scopeId.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success(tToast('roleAssigned'))
          reset()
          onOpenChange(false)
        },
        onError: (err) =>
          toast.error(
            tToast('failed', {
              message: err instanceof ApiClientError ? err.message : String(err),
            }),
          ),
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
          <DialogTitle>{t('assignTitle')}</DialogTitle>
          <DialogDescription>{t('assignDescription')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assign-role">{t('role')}</Label>
            <Select value={roleId || undefined} onValueChange={setRoleId}>
              <SelectTrigger id="assign-role" className="w-full">
                <SelectValue placeholder={t('selectRolePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {activeRoles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}({role.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('user')}</Label>
            <UserPicker value={user} onChange={setUser} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="assign-scope-type">{t('scopeType')}</Label>
              <Select
                value={scopeType}
                onValueChange={(value) => setScopeType(value as ScopeType)}
              >
                <SelectTrigger id="assign-scope-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`scopeTypeValue.${type}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="assign-scope-id">{t('scopeId')}</Label>
              <Input
                id="assign-scope-id"
                value={scopeId}
                disabled={scopeType === 'global'}
                placeholder={t('scopeIdPlaceholder')}
                onChange={(e) => setScopeId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('scopeIdHint')}</p>
            </div>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button disabled={assign.isPending} onClick={handleSubmit}>
            {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function RoleAssignmentsTab({ appId }: { appId: string }) {
  const t = useTranslations('apps.detail.roleAssignments')
  const tApps = useTranslations('apps')
  const tToast = useTranslations('apps.toast')
  const format = useFormatter()
  const [assignOpen, setAssignOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<ApplicationUserRole | null>(null)

  const { data, isPending, isError, refetch } = useRoleAssignments(appId)
  const { data: rolesData } = useAppRoles(appId)
  const revoke = useRevokeRoleAssignment(appId)

  const roleNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const role of rolesData?.items ?? []) map.set(role.id, `${role.name}(${role.code})`)
    return map
  }, [rolesData])

  const statusLabels = {
    active: t('statusValue.active'),
    revoked: t('statusValue.revoked'),
    expired: t('statusValue.expired'),
  }

  const handleRevoke = (assignment: ApplicationUserRole) => {
    revoke.mutate(assignment.id, {
      onSuccess: () => toast.success(tToast('roleRevoked')),
      onError: (error) =>
        toast.error(
          tToast('failed', {
            message: error instanceof ApiClientError ? error.message : String(error),
          }),
        ),
    })
  }

  const items = data?.items ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setAssignOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          {t('assign')}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('role')}</TableHead>
              <TableHead>{t('user')}</TableHead>
              <TableHead>{t('scope')}</TableHead>
              <TableHead>{t('status')}</TableHead>
              <TableHead>{t('projection')}</TableHead>
              <TableHead>{t('createdAt')}</TableHead>
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
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-8 text-center text-muted-foreground"
                >
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              items.map((assignment) => (
                <TableRow key={assignment.id}>
                  <TableCell className="font-medium text-foreground">
                    {roleNameById.get(assignment.applicationRoleId) ?? t('unknownRole')}
                  </TableCell>
                  <TableCell>
                    <span
                      className="block max-w-48 truncate font-mono text-xs text-secondary-foreground"
                      title={assignment.keycloakSub}
                    >
                      {assignment.keycloakSub}
                    </span>
                  </TableCell>
                  <TableCell className="text-secondary-foreground">
                    {t(`scopeTypeValue.${assignment.scopeType}`)}
                    {assignment.scopeId ? (
                      <span className="ml-1 font-mono text-xs text-muted-foreground">
                        {assignment.scopeId}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <AssignmentStatusBadge status={assignment.status} labels={statusLabels} />
                  </TableCell>
                  <TableCell>
                    <ProjectionBadge status={assignment.projectionStatus} />
                  </TableCell>
                  <TableCell className="text-secondary-foreground">
                    {format.dateTime(new Date(assignment.createdAt), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    {assignment.status === 'active' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger hover:text-danger"
                        disabled={revoke.isPending}
                        onClick={() => setRevokeTarget(assignment)}
                      >
                        {t('revoke')}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AssignRoleDialog appId={appId} open={assignOpen} onOpenChange={setAssignOpen} />

      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => (!open ? setRevokeTarget(null) : undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('revokeConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('revokeConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (revokeTarget) handleRevoke(revokeTarget)
              }}
            >
              {t('revokeConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

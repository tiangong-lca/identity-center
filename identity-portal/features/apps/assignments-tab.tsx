import { UserPlusIcon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
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
  useAssignments,
  useGrantAssignment,
  useRevokeAssignment,
  type ApplicationAssignment,
  type PortalUserOption,
} from './queries'
import { AssignmentStatusBadge, ProjectionBadge } from './status-badges'
import { UserPicker } from './user-picker'

const PAGE_SIZE = 20
const COLUMN_COUNT = 6

function GrantDialog({
  appId,
  open,
  onOpenChange,
}: {
  appId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('apps.detail.assignments')
  const tToast = useTranslations('apps.toast')
  const [user, setUser] = useState<PortalUserOption | null>(null)
  const grant = useGrantAssignment(appId)

  const handleGrant = () => {
    if (!user || grant.isPending) return
    grant.mutate(user.id, {
      onSuccess: (result) => {
        if (result.projection === 'projected') toast.success(tToast('grantProjected'))
        else toast.info(tToast('grantPending'))
        setUser(null)
        onOpenChange(false)
      },
      onError: (error) =>
        toast.error(
          tToast('failed', {
            message: error instanceof ApiClientError ? error.message : String(error),
          }),
        ),
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setUser(null)
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('grantTitle')}</DialogTitle>
          <DialogDescription>{t('grantDescription')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label>{t('user')}</Label>
          <UserPicker value={user} onChange={setUser} />
          {!user ? <p className="text-xs text-muted-foreground">{t('userRequired')}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button disabled={!user || grant.isPending} onClick={handleGrant}>
            {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AssignmentsTab({ appId }: { appId: string }) {
  const t = useTranslations('apps.detail.assignments')
  const tApps = useTranslations('apps')
  const tToast = useTranslations('apps.toast')
  const format = useFormatter()
  const [page, setPage] = useState(1)
  const [grantOpen, setGrantOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<ApplicationAssignment | null>(null)

  const { data, isPending, isError, refetch } = useAssignments(appId, {
    page,
    pageSize: PAGE_SIZE,
  })
  const revoke = useRevokeAssignment(appId)
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  const statusLabels = {
    active: t('statusValue.active'),
    revoked: t('statusValue.revoked'),
    expired: t('statusValue.expired'),
  }

  const handleRevoke = (assignment: ApplicationAssignment) => {
    revoke.mutate(assignment.id, {
      onSuccess: () => toast.success(tToast('revoked')),
      onError: (error) => {
        if (error instanceof ApiClientError && error.code === 'KEYCLOAK_ERROR') {
          // 502:事实已撤销,KC 投影失败已入重试队列
          toast.warning(tToast('revokeRetry'))
          return
        }
        toast.error(
          tToast('failed', {
            message: error instanceof ApiClientError ? error.message : String(error),
          }),
        )
      },
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setGrantOpen(true)}>
          <UserPlusIcon data-icon="inline-start" />
          {t('grant')}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('user')}</TableHead>
              <TableHead>{t('status')}</TableHead>
              <TableHead>{t('kcProjection')}</TableHead>
              <TableHead>{t('bizProjection')}</TableHead>
              <TableHead>{t('createdAt')}</TableHead>
              <TableHead className="text-right">{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: 4 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={COLUMN_COUNT}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="py-8 text-center">
                  <span className="text-muted-foreground">{tApps('table.loadFailed')}</span>
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
              data?.items.map((assignment) => (
                <TableRow key={assignment.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="truncate text-sm text-foreground">
                        {assignment.userDisplayName ?? assignment.userEmail ?? assignment.keycloakSub}
                      </span>
                      {(assignment.userDisplayName || assignment.userEmail) && (
                        <span
                          className="max-w-56 truncate font-mono text-xs text-muted-foreground"
                          title={assignment.keycloakSub}
                        >
                          {assignment.keycloakSub}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <AssignmentStatusBadge status={assignment.status} labels={statusLabels} />
                  </TableCell>
                  <TableCell>
                    <ProjectionBadge
                      status={assignment.projectionStatus}
                      error={assignment.lastProjectionError}
                    />
                  </TableCell>
                  <TableCell>
                    <ProjectionBadge
                      status={assignment.businessProjectionStatus}
                      error={assignment.lastBusinessProjectionError}
                    />
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

      {data ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{tApps('pagination.total', { total: data.total })}</span>
          <div className="flex items-center gap-3">
            <span>{tApps('pagination.pageInfo', { page: data.page, totalPages })}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {tApps('pagination.prev')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {tApps('pagination.next')}
            </Button>
          </div>
        </div>
      ) : null}

      <GrantDialog appId={appId} open={grantOpen} onOpenChange={setGrantOpen} />

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

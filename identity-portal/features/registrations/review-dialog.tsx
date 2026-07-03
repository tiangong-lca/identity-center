import { useFormatter, useTranslations } from 'next-intl'
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
import { Textarea } from '@/components/ui/textarea'
import { Descriptions, type DescriptionItem } from '@/features/shared/descriptions'
import { ApiClientError } from '@/features/shared/api'
import {
  useApproveRegistration,
  useRejectRegistration,
  type RegistrationRequest,
} from './queries'
import { RegistrationStatusBadge } from './registration-status-badge'

function useErrorMessage() {
  const t = useTranslations('registrations.toast')
  return (error: unknown) =>
    t('failed', { message: error instanceof ApiClientError ? error.message : String(error) })
}

function ReviewForm({ request, onDone }: { request: RegistrationRequest; onDone: () => void }) {
  const t = useTranslations('registrations.dialog')
  const tToast = useTranslations('registrations.toast')
  const errorMessage = useErrorMessage()
  const [comment, setComment] = useState('')
  const [password, setPassword] = useState('')
  const approve = useApproveRegistration()
  const reject = useRejectRegistration()
  const busy = approve.isPending || reject.isPending
  const passwordTooShort = password.length > 0 && password.length < 10

  const handleApprove = () => {
    if (passwordTooShort || busy) return
    approve.mutate(
      {
        id: request.id,
        reviewComment: comment.trim() || undefined,
        temporaryPassword: password || undefined,
      },
      {
        onSuccess: () => {
          toast.success(tToast('approved', { email: request.email }))
          onDone()
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  const handleReject = () => {
    if (busy) return
    reject.mutate(
      { id: request.id, reviewComment: comment.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(tToast('rejected', { email: request.email }))
          onDone()
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="review-comment">{t('reviewComment')}</Label>
        <Textarea
          id="review-comment"
          value={comment}
          maxLength={500}
          placeholder={t('reviewCommentPlaceholder')}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="temporary-password">{t('temporaryPassword')}</Label>
        <Input
          id="temporary-password"
          type="password"
          autoComplete="new-password"
          value={password}
          placeholder={t('temporaryPasswordPlaceholder')}
          aria-invalid={passwordTooShort || undefined}
          onChange={(e) => setPassword(e.target.value)}
        />
        {passwordTooShort ? (
          <p className="text-xs text-danger">{t('temporaryPasswordTooShort')}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{t('temporaryPasswordHint')}</p>
        )}
      </div>
      <DialogFooter>
        <Button variant="destructive" disabled={busy} onClick={handleReject}>
          {t('reject')}
        </Button>
        <Button
          className="bg-success text-primary-foreground hover:bg-success/80"
          disabled={busy || passwordTooShort}
          onClick={handleApprove}
        >
          {t('approve')}
        </Button>
      </DialogFooter>
    </>
  )
}

export function ReviewDialog({
  request,
  onClose,
}: {
  request: RegistrationRequest | null
  onClose: () => void
}) {
  const t = useTranslations('registrations.dialog')
  const format = useFormatter()
  const pending = request?.status === 'pending'

  const items: DescriptionItem[] = request
    ? [
        { key: 'email', label: t('email'), value: request.email },
        { key: 'displayName', label: t('displayName'), value: request.displayName ?? t('none') },
        {
          key: 'reason',
          label: t('reason'),
          value: request.requestedReason ?? t('none'),
        },
        {
          key: 'requestedAccess',
          label: t('requestedAccess'),
          value:
            request.requestedAccess && request.requestedAccess.length > 0 ? (
              <ul>
                {request.requestedAccess.map((entry) => (
                  <li key={entry.applicationCode}>
                    {entry.applicationCode}
                    {entry.roleCode ? ` · ${entry.roleCode}` : ''}
                  </li>
                ))}
              </ul>
            ) : (
              t('noRequestedAccess')
            ),
        },
        {
          key: 'createdAt',
          label: t('createdAt'),
          value: format.dateTime(new Date(request.createdAt), {
            dateStyle: 'medium',
            timeStyle: 'short',
          }),
        },
        {
          key: 'approvalRequired',
          label: t('approvalRequired'),
          value: request.approvalRequired ? t('yes') : t('no'),
        },
        {
          key: 'status',
          label: t('statusLabel'),
          value: <RegistrationStatusBadge status={request.status} />,
        },
        ...(!pending
          ? [
              {
                key: 'reviewedBy',
                label: t('reviewedBy'),
                value: request.reviewedBy ?? t('none'),
              },
              {
                key: 'reviewedAt',
                label: t('reviewedAt'),
                value: request.reviewedAt
                  ? format.dateTime(new Date(request.reviewedAt), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : t('none'),
              },
              {
                key: 'reviewComment',
                label: t('reviewCommentArchived'),
                value: request.reviewComment ?? t('none'),
              },
            ]
          : []),
      ]
    : []

  return (
    <Dialog open={request !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{pending ? t('reviewTitle') : t('viewTitle')}</DialogTitle>
          <DialogDescription>
            {pending ? t('reviewDescription') : t('viewDescription')}
          </DialogDescription>
        </DialogHeader>
        {request ? (
          <>
            <Descriptions items={items} className="rounded-lg border border-border-light bg-muted/50 p-4" />
            {pending ? (
              <ReviewForm request={request} onDone={onClose} />
            ) : (
              <DialogFooter>
                <Button variant="outline" onClick={onClose}>
                  {t('close')}
                </Button>
              </DialogFooter>
            )}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { apiFetch, ApiClientError } from '@/features/shared/api'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 公共注册申请表单(POST /api/public/registration-requests,防枚举固定成功响应) */
export function RegisterForm() {
  const t = useTranslations('register')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError(t('validation.emailInvalid'))
      return
    }
    setPending(true)
    try {
      await apiFetch('/api/public/registration-requests', {
        method: 'POST',
        json: {
          email: email.trim(),
          displayName: displayName.trim() || undefined,
          requestedReason: reason.trim() || undefined,
        },
      })
      setSubmitted(true)
    } catch (err) {
      setError(
        err instanceof ApiClientError && err.code === 'RATE_LIMITED'
          ? t('errors.rateLimited')
          : t('errors.generic'),
      )
    } finally {
      setPending(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-3 text-center" data-testid="register-success">
        <span className="flex size-10 items-center justify-center rounded-full bg-success/10 text-success">✓</span>
        <p className="text-sm font-medium text-foreground">{t('success.title')}</p>
        <p className="text-xs text-muted-foreground">{t('success.description')}</p>
      </div>
    )
  }

  return (
    <form className="flex w-full flex-col gap-4" onSubmit={onSubmit}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="register-email">{t('email')}</Label>
        <Input
          id="register-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('emailPlaceholder')}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="register-display-name">
          {t('displayName')}
          <span className="ml-1 font-normal text-muted-foreground">{t('optional')}</span>
        </Label>
        <Input
          id="register-display-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t('displayNamePlaceholder')}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="register-reason">
          {t('reason')}
          <span className="ml-1 font-normal text-muted-foreground">{t('optional')}</span>
        </Label>
        <Textarea
          id="register-reason"
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('reasonPlaceholder')}
        />
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? t('submitting') : t('submit')}
      </Button>
    </form>
  )
}

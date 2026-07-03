'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { apiFetch, ApiClientError } from '@/features/shared/api'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type CatalogApp = { code: string; name: string; roles: Array<{ code: string; name: string }> }

/** 公共注册申请表单(POST /api/public/registration-requests,防枚举固定成功响应) */
export function RegisterForm() {
  const t = useTranslations('register')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [catalog, setCatalog] = useState<CatalogApp[]>([])
  const [catalogFailed, setCatalogFailed] = useState(false)
  // appCode -> roleCode|undefined;键存在=选中该应用
  const [selection, setSelection] = useState<Record<string, string | undefined>>({})

  useEffect(() => {
    apiFetch<{ items: CatalogApp[] }>('/api/public/applications')
      .then((d) => setCatalog(d.items))
      .catch(() => {
        setCatalog([]) // 目录失败不阻塞基本注册
        setCatalogFailed(true)
      })
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError(t('validation.emailInvalid'))
      return
    }
    setPending(true)
    try {
      const requestedAccess = Object.entries(selection).map(([applicationCode, roleCode]) => ({
        applicationCode,
        ...(roleCode ? { roleCode } : {}),
      }))
      await apiFetch('/api/public/registration-requests', {
        method: 'POST',
        json: {
          email: email.trim(),
          displayName: displayName.trim() || undefined,
          requestedReason: reason.trim() || undefined,
          ...(requestedAccess.length ? { requestedAccess } : {}),
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
      {catalog.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <Label>
            {t('apps.title')}
            <span className="ml-1 font-normal text-muted-foreground">{t('apps.optional')}</span>
          </Label>
          <div className="flex flex-col gap-2">
            {catalog.map((app) => {
              const checked = app.code in selection
              return (
                <div
                  key={app.code}
                  className="flex flex-col gap-1 rounded-md border border-border p-2"
                >
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setSelection((prev) => {
                          const next = { ...prev }
                          if (e.target.checked) next[app.code] = undefined
                          else delete next[app.code]
                          return next
                        })
                      }
                    />
                    {app.name}
                  </label>
                  {checked && app.roles.length > 0 ? (
                    <select
                      className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                      aria-label={t('apps.roleLabel')}
                      value={selection[app.code] ?? ''}
                      onChange={(e) =>
                        setSelection((prev) => ({ ...prev, [app.code]: e.target.value || undefined }))
                      }
                    >
                      <option value="">{t('apps.noRole')}</option>
                      {app.roles.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
      {catalogFailed ? <p className="text-xs text-muted-foreground">{t('apps.loadFailed')}</p> : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? t('submitting') : t('submit')}
      </Button>
    </form>
  )
}

'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiErrorMessage } from '@/features/users/format'
import { useCreateUserMutation } from '@/features/users/queries'

const MIN_PASSWORD_LENGTH = 10
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function UserCreateForm() {
  const t = useTranslations('users.create')
  const tc = useTranslations('users.common')
  const router = useRouter()
  const createUser = useCreateUserMutation()

  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; temporaryPassword?: string }>({})

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors: typeof errors = {}
    if (!EMAIL_PATTERN.test(email.trim())) nextErrors.email = t('validation.emailInvalid')
    if (temporaryPassword.length < MIN_PASSWORD_LENGTH) {
      nextErrors.temporaryPassword = t('validation.passwordMin', { min: MIN_PASSWORD_LENGTH })
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0 || createUser.isPending) return

    createUser.mutate(
      {
        email: email.trim(),
        displayName: displayName.trim() || undefined,
        temporaryPassword,
      },
      {
        onSuccess: (user) => {
          toast.success(t('success'))
          router.push(`/admin/users/${user.id}`)
        },
        onError: (error) => {
          toast.error(apiErrorMessage(error, tc('requestFailed')))
        },
      },
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>{t('formTitle')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="user-email">{t('email')}</Label>
            <Input
              id="user-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t('emailPlaceholder')}
              aria-invalid={errors.email ? true : undefined}
              autoComplete="off"
              required
            />
            {errors.email ? <p className="text-xs text-danger">{errors.email}</p> : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="user-display-name">
              {t('displayName')}
              <span className="font-normal text-muted-foreground">{t('displayNameOptional')}</span>
            </Label>
            <Input
              id="user-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={t('displayNamePlaceholder')}
              maxLength={100}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="user-temporary-password">{t('temporaryPassword')}</Label>
            <Input
              id="user-temporary-password"
              value={temporaryPassword}
              onChange={(event) => setTemporaryPassword(event.target.value)}
              aria-invalid={errors.temporaryPassword ? true : undefined}
              autoComplete="off"
              className="font-mono"
              required
            />
            {errors.temporaryPassword ? (
              <p className="text-xs text-danger">{errors.temporaryPassword}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t('temporaryPasswordHint', { min: MIN_PASSWORD_LENGTH })}
              </p>
            )}
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button asChild type="button" variant="outline">
            <Link href="/admin/users">{t('cancel')}</Link>
          </Button>
          <Button type="submit" disabled={createUser.isPending}>
            {createUser.isPending ? t('submitting') : t('submit')}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}

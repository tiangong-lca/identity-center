'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ORG_TYPES, useCreateOrg, useOrgOptions, type OrgType } from './queries'

const NO_PARENT = 'none'

export function OrgCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations('orgs')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<OrgType>('department')
  const [parentId, setParentId] = useState<string>(NO_PARENT)
  const [validationError, setValidationError] = useState(false)

  const orgOptions = useOrgOptions()
  const createOrg = useCreateOrg()

  const reset = () => {
    setCode('')
    setName('')
    setType('department')
    setParentId(NO_PARENT)
    setValidationError(false)
    createOrg.reset()
  }

  const submit = () => {
    if (!code.trim() || !name.trim()) {
      setValidationError(true)
      return
    }
    setValidationError(false)
    createOrg.mutate(
      {
        code: code.trim(),
        name: name.trim(),
        type,
        ...(parentId !== NO_PARENT ? { parentId } : {}),
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
            <Label htmlFor="org-code">{t('createDialog.code')}</Label>
            <Input
              id="org-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('createDialog.codePlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-name">{t('createDialog.name')}</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('createDialog.namePlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('createDialog.type')}</Label>
            <Select value={type} onValueChange={(v) => setType(v as OrgType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORG_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`type.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t('createDialog.parent')}</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PARENT}>{t('createDialog.parentNone')}</SelectItem>
                {(orgOptions.data?.items ?? []).map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}({org.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {validationError ? (
            <p className="text-xs text-danger">{t('createDialog.required')}</p>
          ) : null}
          {createOrg.isError ? (
            <p className="text-xs text-danger">
              {t('errorPrefix')}: {createOrg.error.message}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t('createDialog.cancel')}</Button>
          </DialogClose>
          <Button onClick={submit} disabled={createOrg.isPending}>
            {t('createDialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

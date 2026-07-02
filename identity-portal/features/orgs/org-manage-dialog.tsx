'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useApplicationOptions, useUserDirectory, type PortalUserOption } from '@/features/shared/lookups'
import { UserPicker } from '@/features/shared/user-picker'
import {
  MEMBER_TYPES,
  useAddOrgMember,
  useOrgMappings,
  useOrgMembers,
  useRemoveOrgMember,
  useSetOrgMapping,
  type PlatformOrg,
} from './queries'

export function OrgManageDialog({
  org,
  onClose,
}: {
  org: PlatformOrg
  onClose: () => void
}) {
  const t = useTranslations('orgs.manageDialog')

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('title', { name: org.name })}</DialogTitle>
          <DialogDescription className="font-mono text-xs">{org.code}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="members">
          <TabsList>
            <TabsTrigger value="members">{t('membersTab')}</TabsTrigger>
            <TabsTrigger value="mappings">{t('mappingsTab')}</TabsTrigger>
          </TabsList>
          <TabsContent value="members">
            <MembersPanel orgId={org.id} orgName={org.name} />
          </TabsContent>
          <TabsContent value="mappings">
            <MappingsPanel orgId={org.id} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function MembersPanel({ orgId, orgName }: { orgId: string; orgName: string }) {
  const t = useTranslations('orgs.manageDialog')
  const te = useTranslations('orgs')
  const format = useFormatter()
  const members = useOrgMembers(orgId)
  const directory = useUserDirectory()
  const addMember = useAddOrgMember(orgId)
  const removeMember = useRemoveOrgMember(orgId)

  const [pickedUser, setPickedUser] = useState<PortalUserOption | null>(null)
  const [memberType, setMemberType] = useState<string>('member')

  const userLabel = useMemo(() => {
    const map = new Map<string, string>()
    for (const u of directory.data?.items ?? []) {
      map.set(u.id, u.displayName ? `${u.displayName}(${u.email})` : u.email)
    }
    return map
  }, [directory.data])

  const memberTypeLabel = (value: string) =>
    (MEMBER_TYPES as readonly string[]).includes(value)
      ? t(`memberTypes.${value as (typeof MEMBER_TYPES)[number]}`)
      : value

  const submit = () => {
    if (!pickedUser) return
    addMember.mutate(
      { portalUserId: pickedUser.id, memberType },
      { onSuccess: () => setPickedUser(null) },
    )
  }

  return (
    <div className="flex flex-col gap-4 pt-3">
      <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
        {members.isLoading ? (
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : (members.data?.items.length ?? 0) === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">{t('memberEmpty')}</p>
        ) : (
          members.data?.items.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 border-b border-border-light px-3 py-2 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">
                  {userLabel.get(member.portalUserId) ?? (
                    <span className="font-mono text-xs">{member.portalUserId}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {member.joinedAt
                    ? format.dateTime(new Date(member.joinedAt), {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    : '—'}
                </p>
              </div>
              <Badge variant="secondary">{memberTypeLabel(member.memberType)}</Badge>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="xs">
                    {t('removeMember')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('removeConfirmTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('removeConfirmDesc', { name: orgName })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('removeCancel')}</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => removeMember.mutate(member.portalUserId)}
                    >
                      {t('removeConfirm')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <Label>{t('addMember')}</Label>
        <UserPicker
          value={pickedUser}
          onChange={setPickedUser}
          labels={{
            placeholder: t('userPickerPlaceholder'),
            empty: t('userPickerEmpty'),
            searching: t('userPickerSearching'),
          }}
        />
        <div className="flex items-center gap-2">
          <Select value={memberType} onValueChange={setMemberType}>
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEMBER_TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`memberTypes.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={submit} disabled={!pickedUser || addMember.isPending}>
            {t('addMemberSubmit')}
          </Button>
        </div>
        {addMember.isError ? (
          <p className="text-xs text-danger">
            {te('errorPrefix')}: {addMember.error.message}
          </p>
        ) : null}
        {removeMember.isError ? (
          <p className="text-xs text-danger">
            {te('errorPrefix')}: {removeMember.error.message}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function MappingsPanel({ orgId }: { orgId: string }) {
  const t = useTranslations('orgs.manageDialog')
  const te = useTranslations('orgs')
  const mappings = useOrgMappings(orgId)
  const apps = useApplicationOptions()
  const setMapping = useSetOrgMapping(orgId)

  const [applicationId, setApplicationId] = useState<string>('')
  const [businessAppOrgId, setBusinessAppOrgId] = useState('')
  const [validationError, setValidationError] = useState(false)

  const appLabel = useMemo(() => {
    const map = new Map<string, string>()
    for (const app of apps.data?.items ?? []) map.set(app.id, `${app.name}(${app.code})`)
    return map
  }, [apps.data])

  const submit = () => {
    if (!applicationId || !businessAppOrgId.trim()) {
      setValidationError(true)
      return
    }
    setValidationError(false)
    setMapping.mutate(
      { applicationId, businessAppOrgId: businessAppOrgId.trim() },
      {
        onSuccess: () => {
          setApplicationId('')
          setBusinessAppOrgId('')
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-4 pt-3">
      <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
        {mappings.isLoading ? (
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : (mappings.data?.items.length ?? 0) === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            {t('mappingEmpty')}
          </p>
        ) : (
          mappings.data?.items.map((mapping) => (
            <div
              key={mapping.id}
              className="flex items-center gap-3 border-b border-border-light px-3 py-2 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">
                  {appLabel.get(mapping.applicationId) ?? (
                    <span className="font-mono text-xs">{mapping.applicationId}</span>
                  )}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {mapping.businessAppOrgId}
                </p>
              </div>
              <Badge variant="outline">{mapping.status}</Badge>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <Label>{t('setMapping')}</Label>
        <Select value={applicationId} onValueChange={setApplicationId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('mappingAppPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {(apps.data?.items ?? []).map((app) => (
              <SelectItem key={app.id} value={app.id}>
                {app.name}({app.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input
            value={businessAppOrgId}
            onChange={(e) => setBusinessAppOrgId(e.target.value)}
            placeholder={t('mappingOrgIdPlaceholder')}
          />
          <Button onClick={submit} disabled={setMapping.isPending}>
            {t('mappingSubmit')}
          </Button>
        </div>
        {validationError ? <p className="text-xs text-danger">{t('mappingRequired')}</p> : null}
        {setMapping.isError ? (
          <p className="text-xs text-danger">
            {te('errorPrefix')}: {setMapping.error.message}
          </p>
        ) : null}
      </div>
    </div>
  )
}

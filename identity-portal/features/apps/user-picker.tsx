import { CheckIcon, SearchIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useUserOptions, type PortalUserOption } from './queries'

/** 用户搜索下拉:keyword 查 /api/admin/users,仅列出启用用户 */
export function UserPicker({
  value,
  onChange,
}: {
  value: PortalUserOption | null
  onChange: (user: PortalUserOption | null) => void
}) {
  const t = useTranslations('apps.detail.userPicker')
  const [input, setInput] = useState('')
  const [keyword, setKeyword] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setKeyword(input.trim()), 300)
    return () => clearTimeout(timer)
  }, [input])

  const { data, isFetching } = useUserOptions(keyword)
  const options = (data?.items ?? []).filter((user) => user.status === 'active')

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={input}
          placeholder={t('keywordPlaceholder')}
          className="pl-8"
          onChange={(e) => setInput(e.target.value)}
        />
      </div>
      <div className="max-h-48 overflow-y-auto rounded-lg border border-border-light">
        {isFetching && options.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-muted-foreground">{t('loading')}</p>
        ) : options.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="flex flex-col p-1">
            {options.map((user) => {
              const active = value?.id === user.id
              return (
                <li key={user.id}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent',
                      active && 'bg-primary/10',
                    )}
                    onClick={() => onChange(active ? null : user)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground">
                        {user.email}
                      </span>
                      {user.displayName ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {user.displayName}
                        </span>
                      ) : null}
                    </span>
                    {active ? <CheckIcon className="size-4 shrink-0 text-primary" /> : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {value ? (
        <p className="text-xs text-muted-foreground">
          {t('selected')}: <span className="text-foreground">{value.email}</span>
        </p>
      ) : null}
    </div>
  )
}

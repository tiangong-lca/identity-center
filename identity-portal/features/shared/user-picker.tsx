'use client'

import { XIcon } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUserSearch, type PortalUserOption } from './lookups'

export type UserPickerLabels = {
  placeholder: string
  empty: string
  searching: string
}

/** 用户选人:关键字搜索 → 结果列表点击选中 → 已选 chip 可清除 */
export function UserPicker({
  value,
  onChange,
  labels,
}: {
  value: PortalUserOption | null
  onChange: (user: PortalUserOption | null) => void
  labels: UserPickerLabels
}) {
  const [keyword, setKeyword] = useState('')
  const deferredKeyword = useDeferredValue(keyword)
  const search = useUserSearch(deferredKeyword)

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-2.5 py-1.5">
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
          {value.displayName ? `${value.displayName}(${value.email})` : value.email}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => onChange(null)}
          aria-label={labels.placeholder}
        >
          <XIcon />
        </Button>
      </div>
    )
  }

  const items = search.data?.items ?? []

  return (
    <div className="flex flex-col gap-1.5">
      <Input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder={labels.placeholder}
      />
      {keyword.trim().length > 0 ? (
        <div className="max-h-40 overflow-y-auto rounded-lg border border-border">
          {search.isLoading ? (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">{labels.searching}</p>
          ) : items.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">{labels.empty}</p>
          ) : (
            items.map((user) => (
              <button
                key={user.id}
                type="button"
                className="flex w-full flex-col items-start gap-0.5 border-b border-border-light px-2.5 py-1.5 text-left last:border-0 hover:bg-accent"
                onClick={() => {
                  onChange(user)
                  setKeyword('')
                }}
              >
                <span className="text-sm text-foreground">{user.displayName ?? user.email}</span>
                <span className="text-xs text-muted-foreground">{user.email}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

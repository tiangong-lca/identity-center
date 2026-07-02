import { Fragment } from 'react'
import { cn } from '@/lib/utils'

export type DescriptionItem = {
  key: string
  label: React.ReactNode
  value: React.ReactNode
}

/** 结构化 Descriptions:label/value 两列定义列表(服务端/客户端通用) */
export function Descriptions({
  items,
  className,
}: {
  items: DescriptionItem[]
  className?: string
}) {
  return (
    <dl className={cn('grid grid-cols-[minmax(112px,176px)_1fr] gap-x-6 gap-y-3 text-sm', className)}>
      {items.map((item) => (
        <Fragment key={item.key}>
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="min-w-0 break-words text-foreground">{item.value}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

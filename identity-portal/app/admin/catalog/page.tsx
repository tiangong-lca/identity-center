// app/admin/catalog/page.tsx
// 临时最小页面(P2b-T1 手动验证用,证明 Monaco/worker 能被 Next.js 生产构建正确打包)。
// Task 3(P2b-T3)会用正式页面(i18n/保存/diff 等)替换这里。
'use client'

import { useState } from 'react'
import { CatalogEditor } from '@/features/catalog/catalog-editor'

export default function CatalogPage() {
  const [value, setValue] = useState('version: 1\napplications: []')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Catalog(临时预览)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          P2b-T1 Monaco 编辑器手动验证页,Task 3 会替换为正式页面。
        </p>
      </div>
      <CatalogEditor value={value} onChange={setValue} />
    </div>
  )
}

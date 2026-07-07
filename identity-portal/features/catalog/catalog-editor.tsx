// features/catalog/catalog-editor.tsx
'use client'

import dynamic from 'next/dynamic'

/**
 * 实际的编辑器实现(`catalog-editor-impl.tsx`)顶层有 `import * as monaco from 'monaco-editor'` +
 * `loader.config({ monaco })`——两者都会在模块求值时立即触碰浏览器专属状态/触发本地 monaco 打包体的引用。
 * 必须保证这个模块只在客户端被求值,因此这里用 `dynamic(..., { ssr:false })` 加载:SSR 阶段完全
 * 不会 import 到 catalog-editor-impl.tsx,构建/服务端渲染不受影响;真正的 `<Editor>`(以及本地
 * monaco 注入、worker 接线、schema 配置)只在浏览器里发生。
 */
const CatalogEditorImpl = dynamic(() => import('./catalog-editor-impl'), {
  ssr: false,
  loading: () => <div className="h-[60vh] animate-pulse rounded bg-muted" />,
})

export function CatalogEditor(props: {
  value: string
  onChange?: (v: string) => void
  readOnly?: boolean
}) {
  return <CatalogEditorImpl {...props} />
}

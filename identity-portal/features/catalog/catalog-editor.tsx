// features/catalog/catalog-editor.tsx
'use client'

import dynamic from 'next/dynamic'
import type { BeforeMount, OnChange } from '@monaco-editor/react'
import { catalogJsonSchema } from '@/lib/catalog/schema'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="h-[60vh] animate-pulse rounded bg-muted" />,
})

/**
 * Web worker 接线(Tier-2 前置条件):monaco-yaml 需要 yaml worker 才能做 schema 校验/补全。
 * 仅在浏览器端设置一次;若这段在某些运行时环境下抛错(理论上不应该,但作为最后一道防线),
 * 不影响 Tier-1(纯高亮)——configureMonacoYaml 本身还有独立的 try/catch 兜底。
 *
 * 参见 docs/references/2026-07-07-monaco-yaml-nextjs.md。
 */
if (typeof window !== 'undefined') {
  try {
    window.MonacoEnvironment = {
      getWorker(_moduleId: string, label: string) {
        if (label === 'yaml') {
          return new Worker(new URL('monaco-yaml/yaml.worker', import.meta.url))
        }
        return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker', import.meta.url))
      },
    }
  } catch {
    /* Tier-1 fallback:worker 接不通时,交给 configureMonacoYaml 的 catch 静默降级 */
  }
}

export function CatalogEditor({
  value,
  onChange,
  readOnly = false,
}: {
  value: string
  onChange?: (v: string) => void
  readOnly?: boolean
}) {
  const beforeMount: BeforeMount = (monaco) => {
    // schema-aware(Tier-2);若 worker 未接通,编辑器仍高亮(Tier-1),服务端 apply 兜底校验
    import('monaco-yaml')
      .then(({ configureMonacoYaml }) => {
        configureMonacoYaml(monaco, {
          enableSchemaRequest: false,
          schemas: [
            { uri: 'inmemory://catalog.json', fileMatch: ['*'], schema: catalogJsonSchema as object },
          ],
        })
      })
      .catch(() => {
        /* Tier-1 fallback:纯 YAML 高亮 */
      })
  }
  const handleChange: OnChange = (v) => onChange?.(v ?? '')
  return (
    <MonacoEditor
      height="60vh"
      language="yaml"
      value={value}
      onChange={handleChange}
      beforeMount={beforeMount}
      options={{ minimap: { enabled: false }, fontSize: 13, readOnly, scrollBeyondLastLine: false }}
    />
  )
}

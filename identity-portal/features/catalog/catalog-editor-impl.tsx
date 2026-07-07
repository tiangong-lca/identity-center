// features/catalog/catalog-editor-impl.tsx
'use client'

/**
 * 本文件仅通过 catalog-editor.tsx 的 `dynamic(..., { ssr:false })` 加载——绝不会在 SSR 阶段被 import。
 * 因此这里的顶层 `import * as monaco from 'monaco-editor'` 是安全的:它只会在浏览器端执行,
 * 不会在 Node/SSR 渲染时触碰 `window`/`document` 而导致构建或渲染报错。
 *
 * 关键修复(CSP):`@monaco-editor/react` 默认通过 `@monaco-editor/loader` 从 jsdelivr CDN 拉取
 * monaco(`loader.config` 默认 `paths.vs` 指向 `https://cdn.jsdelivr.net/...`),而本应用的 CSP 是
 * `script-src 'self' 'unsafe-inline'`(见 proxy.ts)——外部脚本会被浏览器拦截,导致 Monaco 永远无法
 * 加载,`.monaco-editor` 也就永远不会出现。这里改用 `loader.config({ monaco })`,把已经作为项目依赖
 * 本地打包好的 `monaco-editor`(^0.55.1)直接注入 loader 的内部状态;`@monaco-editor/loader` 的
 * `init()` 发现 `state.monaco` 已经存在时会直接 resolve 这个实例,完全跳过注入 `<script src=".../cdn.../loader.js">`
 * 的那条路径——Monaco 因此完全来自本地打包产物(随 `/_next` 一起分发,满足 `'self'`),不再依赖 CDN。
 */
import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
import Editor, { type BeforeMount, type OnChange } from '@monaco-editor/react'
import { catalogJsonSchema } from '@/lib/catalog/schema'

loader.config({ monaco })

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

export default function CatalogEditorImpl({
  value,
  onChange,
  readOnly = false,
}: {
  value: string
  onChange?: (v: string) => void
  readOnly?: boolean
}) {
  const beforeMount: BeforeMount = (monacoInstance) => {
    // schema-aware(Tier-2);若 worker 未接通,编辑器仍高亮(Tier-1),服务端 apply 兜底校验
    import('monaco-yaml')
      .then(({ configureMonacoYaml }) => {
        configureMonacoYaml(monacoInstance, {
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
    <Editor
      height="60vh"
      language="yaml"
      value={value}
      onChange={handleChange}
      beforeMount={beforeMount}
      options={{ minimap: { enabled: false }, fontSize: 13, readOnly, scrollBeyondLastLine: false }}
    />
  )
}

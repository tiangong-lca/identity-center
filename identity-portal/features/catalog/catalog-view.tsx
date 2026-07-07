// features/catalog/catalog-view.tsx
'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ApiClientError } from '@/features/shared/api'
import { CatalogEditor } from './catalog-editor'
import { useApplyCatalog, useCatalog } from './queries'
import { VersionHistory } from './version-history'

type Issue = { path: string; message: string }

export function CatalogView() {
  const t = useTranslations('catalog')
  const { data, isPending, refetch } = useCatalog()
  const apply = useApplyCatalog()
  const [yaml, setYaml] = useState('')
  const [version, setVersion] = useState(0)
  const [issues, setIssues] = useState<Issue[]>([])
  const [diff, setDiff] = useState<unknown>(null)
  // 载入/重载后把服务端快照同步进本地可编辑状态(渲染期调整,而非 effect 里 setState——
  // 避免 react-hooks/set-state-in-effect;仅当拿到"新的"快照(引用变化,来自 fetch/refetch)时才同步一次,
  // 后续本地编辑与 apply 成功后的 setVersion/setYaml 不会被这里覆盖)。
  const [loadedData, setLoadedData] = useState<typeof data>(undefined)
  if (data && data !== loadedData) {
    setLoadedData(data)
    setYaml(data.yaml)
    setVersion(data.version)
  }

  const onApply = () => {
    setIssues([])
    setDiff(null)
    apply.mutate(
      { yaml, expectedVersion: version },
      {
        onSuccess: (r) => {
          // catalog-service.apply 在 !hasChanges(diff) 时是 no-op:返回原封不动的当前版本
          // (无新版本行、无 audit)。此时 r.version === 应用前的 version(尚未被下面覆盖)——
          // 用它判断是否真的发生了版本递增,避免对 no-op 展示与真实 apply 相同的成功提示。
          if (r.version === version) {
            toast.info(t('noChanges'))
            return
          }
          setVersion(r.version)
          setDiff(r.diff)
          toast.success(t('applied', { version: r.version }))
        },
        onError: (e) => {
          if (e instanceof ApiClientError && e.code === 'CONFLICT') {
            toast.error(t('conflict'))
          } else if (e instanceof ApiClientError && e.code === 'VALIDATION_ERROR') {
            const list = (e.details?.issues as Issue[]) ?? []
            setIssues(list)
            toast.error(t('validationTitle'))
          } else {
            toast.error(e instanceof Error ? e.message : String(e))
          }
        },
      },
    )
  }

  if (isPending) return <div className="h-[60vh] animate-pulse rounded bg-muted" />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button onClick={onApply} disabled={apply.isPending}>
          {apply.isPending ? t('applying') : t('apply')}
        </Button>
        <Button variant="outline" onClick={() => refetch()}>
          {t('reload')}
        </Button>
        <span className="text-xs text-muted-foreground">v{version}</span>
      </div>
      <CatalogEditor value={yaml} onChange={setYaml} />
      {issues.length > 0 && (
        <Card className="border border-danger p-3">
          <p className="mb-1 text-sm font-medium text-danger">{t('validationTitle')}</p>
          <ul className="text-sm text-danger">
            {issues.map((i, k) => (
              <li key={k}>
                <code>{i.path}</code>: {i.message}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {diff != null && (
        <Card className="p-3">
          <p className="mb-1 text-sm font-medium">{t('diffTitle')}</p>
          <pre className="overflow-x-auto text-xs">{JSON.stringify(diff, null, 2)}</pre>
        </Card>
      )}
      <VersionHistory
        currentVersion={version}
        onRolledBack={(v) => {
          setVersion(v)
          refetch()
        }}
      />
    </div>
  )
}

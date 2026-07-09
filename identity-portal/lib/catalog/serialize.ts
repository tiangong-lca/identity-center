// lib/catalog/serialize.ts
import { dump, load } from 'js-yaml'
import { catalogDocSchema, type CatalogApp, type CatalogDoc } from './schema'

const ENV_WHOLE = /^\$\{([A-Z][A-Z0-9_]*)\}$/
const ENV_INLINE = /\$\{([A-Z][A-Z0-9_]*)\}/g

/** 整值即 ${NAME} 且未定义 → undefined(可选字段落空);否则内联替换,未定义按空串 */
function interpolate(value: unknown, env: NodeJS.ProcessEnv): unknown {
  if (typeof value !== 'string') return value
  const whole = value.match(ENV_WHOLE)
  if (whole) return env[whole[1]]
  return value.replace(ENV_INLINE, (_, name) => env[name] ?? '')
}

function interpolateApp(app: Record<string, unknown>, env: NodeJS.ProcessEnv): Record<string, unknown> {
  const out: Record<string, unknown> = { ...app }
  if ('loginUrl' in out) {
    const v = interpolate(out.loginUrl, env)
    if (v === undefined) delete out.loginUrl
    else out.loginUrl = v
  }
  if ('adminUrl' in out) {
    const v = interpolate(out.adminUrl, env)
    if (v === undefined) delete out.adminUrl
    else out.adminUrl = v
  }
  if (out.webhook && typeof out.webhook === 'object') {
    const w = { ...(out.webhook as Record<string, unknown>) }
    const url = interpolate(w.url, env)
    if (url === undefined) delete out.webhook // url 缺失 → 整个 webhook 省略(secretRef 不单独插值)
    else out.webhook = { ...w, url }
  }
  return out
}

/** 解析 YAML 文本 → ${ENV} 插值 → zod 校验 → CatalogDoc */
export function parseCatalogYaml(text: string, env: NodeJS.ProcessEnv = process.env): CatalogDoc {
  const raw = load(text)
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('catalog YAML 为空或非对象')
  }
  const doc = raw as Record<string, unknown>
  const apps = Array.isArray(doc.applications) ? doc.applications : []
  return catalogDocSchema.parse({
    ...doc,
    applications: apps.map((a) => interpolateApp(a as Record<string, unknown>, env)),
  })
}

type AppRow = {
  id: string
  code: string
  name: string
  status: string
  keycloakClientId: string
  accessClientRole: string
  webhookUrl: string | null
  webhookSecretRef: string | null
  loginUrl: string | null
  adminUrl: string | null
}
type RoleRow = {
  id: string
  applicationId: string
  code: string
  name: string
  description: string | null
  status: string
}

/** DB 行 → CatalogApp[](排除 pending_deactivate 和 deactivated 的应用与角色;这些是待停用/已停用墓碑,不进可编辑 YAML) */
export function toCatalogApps(appRows: AppRow[], roleRows: RoleRow[]): CatalogApp[] {
  return appRows
    .filter((a) => a.status !== 'pending_deactivate' && a.status !== 'deactivated')
    .map((a) => ({
      code: a.code,
      name: a.name,
      status: (a.status === 'disabled' ? 'disabled' : 'active') as 'active' | 'disabled',
      keycloak: { clientId: a.keycloakClientId, accessRole: a.accessClientRole },
      webhook:
        a.webhookUrl && a.webhookSecretRef
          ? { url: a.webhookUrl, secretRef: a.webhookSecretRef }
          : undefined,
      loginUrl: a.loginUrl ?? undefined,
      adminUrl: a.adminUrl ?? undefined,
      roles: roleRows
        .filter((r) => r.applicationId === a.id && r.status !== 'pending_deactivate' && r.status !== 'deactivated')
        .map((r) => ({ code: r.code, name: r.name, description: r.description ?? undefined })),
    }))
}

/** CatalogApp[] → YAML 文本(secretRef 原样;url 输出已解析值,不反解 ${ENV}) */
export function renderCatalogYaml(apps: CatalogApp[]): string {
  const doc: CatalogDoc = { version: 1, applications: apps }
  return dump(doc, { lineWidth: 100, noRefs: true, sortKeys: false })
}

/**
 * 业务应用目录 export(声明式,DB → YAML):
 *   pnpm export-catalog                 # 打到 stdout
 *   pnpm export-catalog -- --out out.yaml
 * 内容 = 当前期望态(active+disabled;过滤 pending_deactivate/deactivated;只出 secretRef,不出明文)。
 * 前置:DATABASE_URL。
 */
import 'dotenv/config'
import { writeFile } from 'node:fs/promises'
import { createDbClient } from '@/lib/db/client'
import { parseCatalogYaml } from '@/lib/catalog/serialize'
import { scanForPlaintextSecrets, type SecretFinding } from '@/lib/catalog/secret-scan'
import { createKeycloakAdmin, keycloakConfigFromEnv } from '@/lib/keycloak/admin-client'
import { createCatalogService } from '@/server/services/catalog-service'
import type { ServiceContext } from '@/server/services/context'

export async function exportCatalogYaml(
  ctx: ServiceContext,
): Promise<{ yaml: string; findings: SecretFinding[] }> {
  const { yaml } = await createCatalogService(ctx).getCurrent()
  const findings = scanForPlaintextSecrets(parseCatalogYaml(yaml))
  return { yaml, findings }
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL 未配置')
  const out = argValue('--out')
  const client = createDbClient(url)
  try {
    const ctx: ServiceContext = { db: client.db, keycloak: createKeycloakAdmin(keycloakConfigFromEnv()) }
    const { yaml, findings } = await exportCatalogYaml(ctx)
    if (findings.length > 0) console.error(`[export-catalog] ⚠️ 疑似明文(仅路径): ${findings.map((f) => f.path).join(', ')}`)
    if (out) {
      await writeFile(out, yaml, 'utf8')
      console.error(`[export-catalog] 已写 ${out}`)
    } else {
      process.stdout.write(yaml)
    }
  } finally {
    await client.close()
  }
}

// 仅作为脚本直接运行时执行(被测试 import 时不跑)
if (process.argv[1] && process.argv[1].endsWith('export-catalog.ts')) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}

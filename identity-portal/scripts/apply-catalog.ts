/**
 * 业务应用目录 apply(声明式):
 *   pnpm apply-catalog                 # 应用 config/business-apps.yaml
 *   pnpm apply-catalog -- --file x.yaml
 *   pnpm apply-catalog -- --check      # 干跑:只算 diff、不写库/不碰 KC
 * 前置:DATABASE_URL、KEYCLOAK_*(reconcile 用);Keycloak 在运行。
 */
import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { createDbClient } from '@/lib/db/client'
import { computeCatalogDiff, type CatalogDiff } from '@/lib/catalog/diff'
import { parseCatalogYaml, toCatalogApps } from '@/lib/catalog/serialize'
import { createKeycloakAdmin, keycloakConfigFromEnv } from '@/lib/keycloak/admin-client'
import { createCatalogService, type ApplyResult } from '@/server/services/catalog-service'
import type { ServiceContext } from '@/server/services/context'

export async function applyCatalogFromFile(
  ctx: ServiceContext,
  filePath: string,
  opts: { check?: boolean } = {},
): Promise<ApplyResult | { diff: CatalogDiff; dryRun: true }> {
  const text = await readFile(filePath, 'utf8')
  if (opts.check) {
    const doc = parseCatalogYaml(text)
    const apps = await ctx.db.query.applications.findMany()
    const roles = await ctx.db.query.applicationRoles.findMany()
    return { diff: computeCatalogDiff(toCatalogApps(apps, roles), doc.applications), dryRun: true }
  }
  return createCatalogService(ctx).apply({ yaml: text, source: 'cli' })
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL 未配置')
  const file = argValue('--file') ?? 'config/business-apps.yaml'
  const check = process.argv.includes('--check')
  const client = createDbClient(url)
  try {
    const ctx: ServiceContext = { db: client.db, keycloak: createKeycloakAdmin(keycloakConfigFromEnv()) }
    const result = await applyCatalogFromFile(ctx, file, { check })
    console.log(check ? '[apply-catalog] 干跑 diff:' : '[apply-catalog] 已应用:')
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await client.close()
  }
}

// 仅作为脚本直接运行时执行 main(被测试 import 时不跑)
if (process.argv[1] && process.argv[1].endsWith('apply-catalog.ts')) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}

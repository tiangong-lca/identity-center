import { readFile } from 'node:fs/promises'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as schema from '@/db/schema'
import { parseCatalogYaml } from '@/lib/catalog/serialize'
import { materializeCatalog } from '@/server/services/catalog-materialize'

type Db = NodePgDatabase<typeof schema>

/** 由 config/business-apps.yaml 物化业务应用目录到 DB(纯 DB,不碰 Keycloak;单一真源) */
export async function seedBusinessApps(db: Db) {
  const doc = parseCatalogYaml(await readFile('config/business-apps.yaml', 'utf8'))
  await db.transaction(async (tx) => {
    const curAppRows = await tx.query.applications.findMany()
    const curRoleRows = await tx.query.applicationRoles.findMany()
    await materializeCatalog(tx, doc.applications, curAppRows, curRoleRows)
  })
}

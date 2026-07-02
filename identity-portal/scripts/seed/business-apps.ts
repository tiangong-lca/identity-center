import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/db/schema'

type Db = NodePgDatabase<typeof schema>

/** 首个业务应用登记(幂等):Supabase */
export async function seedBusinessApps(db: Db) {
  const existing = await db.query.applications.findFirst({
    where: eq(schema.applications.code, 'supabase'),
  })
  if (existing) return

  await db.insert(schema.applications).values({
    code: 'supabase',
    name: 'Supabase 业务应用',
    keycloakClientId: 'supabase-business-app',
    accessClientRole: 'supabase_app_access',
    status: 'active',
    webhookUrl: process.env.SUPABASE_WEBHOOK_URL ?? null,
    webhookSecretRef: 'SUPABASE_WEBHOOK_SECRET',
    metadata: { onboarding: 'L6', kind: 'supabase' },
  })
}

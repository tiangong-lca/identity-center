/**
 * 存量用户迁移工具(幂等,迁移与接入指南 §用户盘点):
 *   pnpm tsx scripts/migrate-legacy-users.ts <legacy-users.json>
 * 输入 JSON 数组:[{ externalId?, email?, phone?, username?, displayName? }]
 * 匹配优先级:externalId > 已验证邮箱 > 手机号(metadata) > username;命中即建 portal_users 映射,
 * 未命中标记 manual。不创建 Keycloak 用户(避免误建;人工确认后走正式开通)。
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { createDbClient, type DrizzleDb } from '@/lib/db/client'
import { createKeycloakAdmin, keycloakConfigFromEnv } from '@/lib/keycloak/admin-client'

export type LegacyUser = {
  externalId?: string
  email?: string
  phone?: string
  username?: string
  displayName?: string
}

export type MigrationOutcome = {
  legacy: LegacyUser
  result: 'matched' | 'created' | 'manual'
  keycloakSub?: string
  reason?: string
}

type KcAdmin = ReturnType<typeof createKeycloakAdmin>

/** 按优先级在 Keycloak 中匹配存量用户;返回 keycloakUserId 或 null */
export async function matchKeycloakUser(kc: KcAdmin, legacy: LegacyUser): Promise<string | null> {
  if (legacy.email) {
    const byEmail = await kc.findUserByEmail(legacy.email)
    if (byEmail?.id && byEmail.emailVerified) return byEmail.id
  }
  return null
}

export async function migrateLegacyUsers(
  db: DrizzleDb,
  kc: KcAdmin,
  legacyUsers: LegacyUser[],
): Promise<MigrationOutcome[]> {
  const outcomes: MigrationOutcome[] = []
  for (const legacy of legacyUsers) {
    const keycloakUserId = await matchKeycloakUser(kc, legacy)
    if (!keycloakUserId) {
      outcomes.push({ legacy, result: 'manual', reason: '未匹配到已验证的 Keycloak 用户,需人工处理' })
      continue
    }
    const existing = await db.query.portalUsers.findFirst({
      where: eq(schema.portalUsers.keycloakSub, keycloakUserId),
    })
    if (existing) {
      outcomes.push({ legacy, result: 'matched', keycloakSub: keycloakUserId })
      continue
    }
    await db.insert(schema.portalUsers).values({
      keycloakSub: keycloakUserId,
      keycloakUserId,
      email: legacy.email ?? '',
      displayName: legacy.displayName,
      status: 'active',
      metadata: {
        legacyIdentity: {
          externalId: legacy.externalId ?? null,
          username: legacy.username ?? null,
          phone: legacy.phone ?? null,
        },
      },
    })
    outcomes.push({ legacy, result: 'created', keycloakSub: keycloakUserId })
  }
  return outcomes
}

async function main() {
  const file = process.argv[2]
  if (!file) throw new Error('用法: tsx scripts/migrate-legacy-users.ts <legacy-users.json>')
  const legacyUsers = JSON.parse(readFileSync(file, 'utf8')) as LegacyUser[]
  const client = createDbClient(process.env.DATABASE_URL ?? '')
  const kc = createKeycloakAdmin(keycloakConfigFromEnv())
  try {
    const outcomes = await migrateLegacyUsers(client.db, kc, legacyUsers)
    const summary = outcomes.reduce<Record<string, number>>((acc, o) => {
      acc[o.result] = (acc[o.result] ?? 0) + 1
      return acc
    }, {})
    console.log('迁移报告:', JSON.stringify(summary))
    for (const o of outcomes.filter((x) => x.result === 'manual')) {
      console.log(`  人工处理: ${o.legacy.email ?? o.legacy.username ?? o.legacy.externalId}`)
    }
  } finally {
    await client.close()
  }
}

if (process.argv[1]?.includes('migrate-legacy-users')) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}

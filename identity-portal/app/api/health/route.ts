import { sql } from 'drizzle-orm'
import { newRequestId } from '@/lib/http/request-id'
import { getDb } from '@/lib/db'
import { getRedis } from '@/lib/rate-limit/redis'
import { ok } from '@/lib/http/response'

export async function GET() {
  const requestId = newRequestId()
  const checks: Record<string, boolean> = {}
  try {
    await getDb().db.execute(sql`SELECT 1`)
    checks.database = true
  } catch {
    checks.database = false
  }
  try {
    checks.redis = (await getRedis().ping()) === 'PONG'
  } catch {
    checks.redis = false
  }
  const healthy = Object.values(checks).every(Boolean)
  return ok({ status: healthy ? 'up' : 'degraded', checks }, requestId, healthy ? 200 : 503)
}

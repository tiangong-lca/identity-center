import { count, eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import type { ServiceContext } from './context'

export type OverviewStats = {
  users: number
  apps: number
  pendingRegistrations: number
  activeAssignments: number
}

/** 管理后台概览 KPI(实时统计) */
export function createStatsService(ctx: ServiceContext) {
  return {
    async overview(): Promise<OverviewStats> {
      const [[users], [apps], [pending], [assignments]] = await Promise.all([
        ctx.db.select({ n: count() }).from(schema.portalUsers),
        ctx.db
          .select({ n: count() })
          .from(schema.applications)
          .where(eq(schema.applications.status, 'active')),
        ctx.db
          .select({ n: count() })
          .from(schema.registrationRequests)
          .where(eq(schema.registrationRequests.status, 'pending')),
        ctx.db
          .select({ n: count() })
          .from(schema.applicationAssignments)
          .where(eq(schema.applicationAssignments.status, 'active')),
      ])
      return {
        users: users.n,
        apps: apps.n,
        pendingRegistrations: pending.n,
        activeAssignments: assignments.n,
      }
    },
  }
}

import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { checkApplicationAccess } from '@/lib/business-app-kit/verify-access'
import { verifyPlatformWebhook } from '@/lib/business-app-kit/verify-webhook'
import { createKeycloakAdmin } from '@/lib/keycloak/admin-client'
import { createRabbitMqAdapter } from '@/lib/mq/rabbitmq-adapter'
import { seedAdminRbac } from '@/scripts/seed/admin-rbac'
import { seedBusinessApps } from '@/scripts/seed/business-apps'
import { dispatchOutboxEvents } from '@/server/jobs/dispatch-outbox-events'
import { deliverDueWebhooks, enqueueWebhookDeliveries } from '@/server/jobs/deliver-webhooks'
import { reconcileApplicationProjections } from '@/server/jobs/reconcile'
import type { JobContext } from '@/server/jobs/types'
import { createApplicationService } from '@/server/services/application-service'
import { createAssignmentService } from '@/server/services/assignment-service'
import type { ServiceContext } from '@/server/services/context'
import { createRegistrationService } from '@/server/services/registration-service'
import { getDbTargets } from './helpers/db-targets'
import { resolveAdminApiConfig } from './helpers/keycloak'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

const pg = getDbTargets()[0]
const suffix = randomUUID().slice(0, 8)

/**
 * L6 全链路联调:注册→审批→开通→准入→角色→同步(outbox→MQ→webhook)
 * →业务侧 verifier 校验放行→撤权→verifier 拒绝→对账无差异。
 * 以 business-app-kit 参考 verifier 代替真实 tiangong-lca。
 */
describe('L6 tiangong-lca 端到端开通链路(真实 PG/KC/RabbitMQ)', () => {
  let tdb: TestDb
  let ctx: JobContext & ServiceContext
  let webhookServer: Server
  let webhookPort: number
  const received: Array<{ headers: Record<string, string | string[] | undefined>; body: string; valid: boolean }> = []
  let keycloakUserId: string
  let portalUserId: string
  let lcaAppId: string
  const WEBHOOK_SECRET = 'l6-tiangong-lca-secret'

  beforeAll(async () => {
    tdb = await createMigratedTestDb(pg.adminUrl)
    const kc = createKeycloakAdmin(await resolveAdminApiConfig())
    const mq = createRabbitMqAdapter(process.env.RABBITMQ_URL ?? 'amqp://identity:identity@localhost:5672')
    ctx = { db: tdb.db, keycloak: kc, mq }
    await seedAdminRbac(tdb.db)

    process.env.TIANGONG_LCA_WEBHOOK_SECRET = WEBHOOK_SECRET
    // 业务侧 webhook 接收端(验签)
    webhookServer = createServer((req, res) => {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        const verify = verifyPlatformWebhook({
          secret: WEBHOOK_SECRET,
          signature: String(req.headers['x-webhook-signature'] ?? ''),
          timestamp: String(req.headers['x-webhook-timestamp'] ?? ''),
          rawBody: body,
        })
        received.push({ headers: req.headers, body, valid: verify.valid })
        res.statusCode = 200
        res.end()
      })
    })
    await new Promise<void>((r) => webhookServer.listen(0, () => r()))
    webhookPort = (webhookServer.address() as { port: number }).port

    // 登记 tiangong-lca 应用并挂真实 webhook 端点
    await seedBusinessApps(tdb.db)
    const app = await createApplicationService(ctx).getByCode('tiangong-lca')
    lcaAppId = app!.id
    await tdb.db
      .update(schema.applications)
      .set({ webhookUrl: `http://127.0.0.1:${webhookPort}/hooks` })
      .where(eq(schema.applications.id, lcaAppId))
  })

  afterAll(async () => {
    webhookServer?.close()
    if (keycloakUserId) await ctx.keycloak.deleteUser(keycloakUserId).catch(() => {})
    await ctx.mq.close()
    await tdb?.destroy()
  })

  it('注册 → 审批开通(建 KC 用户 + 镜像)', async () => {
    const reg = createRegistrationService(ctx)
    const email = `l6-${suffix}@test.local`
    const submitted = await reg.submit({ email, displayName: 'L6 联调用户' })
    const { portalUser } = await reg.approve(submitted.id, {})
    portalUserId = portalUser.id
    keycloakUserId = portalUser.keycloakUserId as string
    expect(keycloakUserId).toBeTruthy()
  })

  it('授予 tiangong-lca 准入 → 投影 KC Client Role → 业务侧 verifier 放行', async () => {
    const { projection } = await createAssignmentService(ctx).grant(lcaAppId, portalUserId)
    expect(projection).toBe('projected')

    // 用真实 access token 验证(client credentials 无 resource_access,改用 admin 查角色映射构造断言)
    const kcClient = await ctx.keycloak.findClientByClientId('tiangong-lca-business-app')
    const roles = await ctx.keycloak.listUserClientRoles(keycloakUserId, kcClient!.id!)
    expect(roles.some((r) => r.name === 'tiangong_lca_access')).toBe(true)

    // 业务侧 verifier:模拟含该角色的 token
    const token = fakeToken({ 'tiangong-lca-business-app': { roles: ['tiangong_lca_access'] } })
    expect(checkApplicationAccess(token, 'tiangong-lca-business-app', 'tiangong_lca_access')).toEqual({
      allowed: true,
    })
  })

  it('同步链路:outbox → MQ → webhook 扇出 → 业务端验签通过', async () => {
    const stop = await ctx.mq.consume(
      `l6.fanout.${suffix}`,
      ['identity.user.*', 'access.application.*'],
      async (msg) => {
        await enqueueWebhookDeliveries(ctx, msg)
      },
      { consumer: 'webhook-fanout' },
    )
    const dispatch = await dispatchOutboxEvents(ctx)
    expect(dispatch.failed).toBe(0)
    await waitFor(async () => (await tdb.db.query.webhookDeliveries.findMany()).length >= 1)
    const delivered = await deliverDueWebhooks(ctx)
    expect(delivered.processed).toBeGreaterThanOrEqual(1)
    // 业务端全部验签通过
    expect(received.length).toBeGreaterThanOrEqual(1)
    expect(received.every((r) => r.valid)).toBe(true)
    await stop()
  })

  it('撤销准入 → KC 角色移除 → 业务侧 verifier 拒绝 → 对账无差异', async () => {
    const { outcome } = await createAssignmentService(ctx).revoke(lcaAppId, portalUserId)
    expect(outcome).toBe('revoked')

    const kcClient = await ctx.keycloak.findClientByClientId('tiangong-lca-business-app')
    const roles = await ctx.keycloak.listUserClientRoles(keycloakUserId, kcClient!.id!)
    expect(roles.some((r) => r.name === 'tiangong_lca_access')).toBe(false)

    // 撤权后 token 刷新不再含角色 → 业务侧拒绝
    const tokenAfter = fakeToken({ 'tiangong-lca-business-app': { roles: [] } })
    expect(checkApplicationAccess(tokenAfter, 'tiangong-lca-business-app', 'tiangong_lca_access')).toMatchObject({
      allowed: false,
      code: 'APP_ACCESS_DENIED',
    })

    // 对账:平台事实与 KC 投影一致,无漂移
    const recon = await reconcileApplicationProjections(ctx)
    expect((recon.details as { drift: number }).drift).toBe(0)
  })
})

function fakeToken(resourceAccess: Record<string, { roles: string[] }>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ resource_access: resourceAccess })).toString('base64url')
  return `${header}.${payload}.sig`
}

async function waitFor(cond: () => Promise<boolean>, timeoutMs = 10_000) {
  const start = Date.now()
  while (!(await cond())) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor 超时')
    await new Promise((r) => setTimeout(r, 100))
  }
}

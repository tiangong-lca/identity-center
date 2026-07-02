import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { computeRecordHash, createAuditLogRepository } from '@/server/repositories/audit-log-repository'
import { createPortalUsersRepository } from '@/server/repositories/portal-users-repository'
import { getDbTargets } from './helpers/db-targets'
import { createMigratedTestDb, type TestDb } from './helpers/test-db'

describe.each(getDbTargets())('repositories($name)', ({ adminUrl }) => {
  let tdb: TestDb

  beforeAll(async () => {
    tdb = await createMigratedTestDb(adminUrl)
  })

  afterAll(async () => {
    await tdb?.destroy()
  })

  describe('portal-users-repository', () => {
    it('create / findByKeycloakSub / updateStatus', async () => {
      const repo = createPortalUsersRepository(tdb.db)
      const created = await repo.create({
        keycloakSub: 'sub-repo-1',
        email: 'repo1@x.com',
        displayName: '张三',
      })
      expect(created.id).toBeTruthy()
      expect(created.status).toBe('active')

      const found = await repo.findByKeycloakSub('sub-repo-1')
      expect(found?.id).toBe(created.id)

      const disabled = await repo.updateStatus(created.id, 'disabled')
      expect(disabled?.status).toBe('disabled')
    })

    it('list 分页 + 关键字 + 状态过滤', async () => {
      const repo = createPortalUsersRepository(tdb.db)
      for (let i = 0; i < 25; i++) {
        await repo.create({
          keycloakSub: `sub-list-${i}`,
          email: `list${i}@example.com`,
          displayName: `用户${i}`,
        })
      }
      const page1 = await repo.list({ page: 1, pageSize: 10, keyword: 'list' })
      expect(page1.items).toHaveLength(10)
      expect(page1.total).toBe(25)

      const page3 = await repo.list({ page: 3, pageSize: 10, keyword: 'list' })
      expect(page3.items).toHaveLength(5)

      const disabled = await repo.list({ status: 'disabled' })
      expect(disabled.total).toBe(1) // 上一个用例禁用的那位
    })
  })

  describe('audit-log-repository(hash 链)', () => {
    it('append 构成连续 hash 链且可校验', async () => {
      const repo = createAuditLogRepository(tdb.db)
      const base = {
        actorKeycloakSub: 'admin-sub',
        actorEmail: 'admin@identity.local',
        targetType: 'user',
        result: 'success',
      }
      const a = await repo.append({ ...base, action: 'user.create', targetId: 'u1' })
      const b = await repo.append({ ...base, action: 'user.disable', targetId: 'u1' })
      const c = await repo.append({ ...base, action: 'user.enable', targetId: 'u1' })

      expect(a.previousHash).toBeNull()
      expect(b.previousHash).toBe(a.recordHash)
      expect(c.previousHash).toBe(b.recordHash)

      // 重算校验第二条
      const recomputed = computeRecordHash(a.recordHash, {
        actorKeycloakSub: b.actorKeycloakSub,
        actorEmail: b.actorEmail,
        action: b.action,
        targetType: b.targetType,
        targetId: b.targetId,
        result: b.result,
      })
      expect(recomputed).toBe(b.recordHash)
    })

    it('list 按 action 过滤分页', async () => {
      const repo = createAuditLogRepository(tdb.db)
      const res = await repo.list({ action: 'user.disable' })
      expect(res.total).toBe(1)
      expect(res.items[0].action).toBe('user.disable')
    })
  })
})

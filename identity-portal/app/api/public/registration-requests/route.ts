import { z } from 'zod'
import { ok, parseBody, publicRoute } from '@/app/api/_helpers'
import { createRegistrationService } from '@/server/services/registration-service'

const schema = z.object({
  email: z.email(),
  displayName: z.string().min(1).max(100).optional(),
  requestedOrganizationId: z.uuid().optional(),
  requestedReason: z.string().max(500).optional(),
})

/** 公共注册申请入口(防枚举:固定成功响应,不暴露账号是否已存在) */
export const POST = publicRoute({ scene: 'register' }, async (request, { requestId, ctx }) => {
  const body = await parseBody(request, schema)
  await createRegistrationService(ctx).submit(body)
  return ok({ submitted: true, message: '申请已提交,审核结果将通过邮件通知' }, requestId, 202)
})

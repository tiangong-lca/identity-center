import { z } from 'zod'
import { ApiError, ok, parseBody, publicRoute } from '@/app/api/_helpers'
import { verifyCaptcha } from '@/lib/security/captcha'
import { createRegistrationService } from '@/server/services/registration-service'

const schema = z.object({
  email: z.email(),
  displayName: z.string().min(1).max(100).optional(),
  requestedOrganizationId: z.uuid().optional(),
  requestedReason: z.string().max(500).optional(),
  captchaToken: z.string().optional(),
})

/** 公共注册申请入口(防枚举:固定成功响应,不暴露账号是否已存在;验证码可配置开关) */
export const POST = publicRoute({ scene: 'register' }, async (request, { requestId, ctx }) => {
  const body = await parseBody(request, schema)
  if (!(await verifyCaptcha(body.captchaToken))) {
    throw new ApiError('VALIDATION_ERROR', '人机验证未通过')
  }
  await createRegistrationService(ctx).submit(body)
  return ok({ submitted: true, message: '申请已提交,审核结果将通过邮件通知' }, requestId, 202)
})

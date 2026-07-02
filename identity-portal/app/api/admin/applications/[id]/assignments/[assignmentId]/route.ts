import { adminRoute, ApiError, ok } from '@/app/api/_helpers'
import { createAssignmentService } from '@/server/services/assignment-service'

/**
 * 撤销准入(撤权 API 状态语义,决议 7/10):
 * 200 = 关键完成点达成(KC Client Role 已移除);
 * 502 KEYCLOAK_ERROR = 事实已 revoked 但 KC 投影失败(进入重试,响应附 assignment 状态);
 * 409 = 不存在生效中的准入。
 */
export const DELETE = adminRoute(
  { permission: 'app:revoke', scope: (p) => ({ type: 'app', id: p.id }) },
  async (_request, { requestId, ctx, params }) => {
    const service = createAssignmentService(ctx)
    const assignment = await service.getById(params.assignmentId)
    if (!assignment || assignment.applicationId !== params.id) {
      throw new ApiError('NOT_FOUND', '准入记录不存在')
    }
    const result = await service.revoke(params.id, assignment.portalUserId)
    if (result.outcome === 'projection_failed') {
      throw new ApiError('KEYCLOAK_ERROR', '准入已撤销但认证侧投影失败,系统将自动重试', {
        assignmentId: result.assignment.id,
        status: result.assignment.status,
        projectionStatus: 'failed',
      })
    }
    return ok(result, requestId)
  },
)

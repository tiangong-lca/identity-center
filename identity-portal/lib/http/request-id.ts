/** ID 语义(同步与事件设计 §5):requestId 定位单次请求,traceId 串联异步链路,
 *  operationId 聚合一次业务操作,eventId 作幂等键 */
export const newRequestId = () => `req_${crypto.randomUUID()}`
export const newTraceId = () => `trc_${crypto.randomUUID()}`
export const newOperationId = () => `op_${crypto.randomUUID()}`
export const newEventId = () => `evt_${crypto.randomUUID()}`

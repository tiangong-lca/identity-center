/**
 * MQ adapter 最小接口(确认决议 22):只抽象可靠传输;
 * 重试/死信/延迟等语义由 Outbox 与应用层承担,便于国产 MQ 替换。
 */
export type MqMessage = {
  /** 幂等键(evt_*) */
  eventId: string
  eventType: string
  eventVersion: number
  payload: unknown
  traceId?: string
  operationId?: string
}

export type ConsumeHandler = (message: MqMessage) => Promise<void>

export type ConsumeOptions = {
  /** 消费者标识,用于幂等表 (event_id, consumer) */
  consumer: string
  /** handler 抛错时是否重新入队(默认 false → 丢弃,由对账/死信兜底) */
  requeueOnError?: boolean
}

export type MqAdapter = {
  /** 发布到 topic(routing key),持久化投递 */
  publish(topic: string, message: MqMessage): Promise<void>
  /** 绑定队列消费 topics;返回停止函数 */
  consume(
    queue: string,
    topics: string[],
    handler: ConsumeHandler,
    options: ConsumeOptions,
  ): Promise<() => Promise<void>>
  healthCheck(): Promise<boolean>
  close(): Promise<void>
}

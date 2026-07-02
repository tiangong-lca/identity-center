import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { createRabbitMqAdapter } from '@/lib/mq/rabbitmq-adapter'
import type { MqMessage } from '@/lib/mq/types'

const adapter = createRabbitMqAdapter(
  process.env.RABBITMQ_URL ?? 'amqp://identity:identity@localhost:5672',
)

afterAll(async () => {
  await adapter.close()
})

function testMessage(overrides: Partial<MqMessage> = {}): MqMessage {
  return {
    eventId: `evt_${randomUUID()}`,
    eventType: 'identity.user.created',
    eventVersion: 1,
    payload: { keycloakSub: 'sub-1' },
    traceId: `trc_${randomUUID()}`,
    ...overrides,
  }
}

describe('MQ adapter 契约(RabbitMQ 实现)', () => {
  it('healthCheck 通过', async () => {
    expect(await adapter.healthCheck()).toBe(true)
  })

  it('发布→消费→ack 全链路,消息内容完整', async () => {
    const queue = `test.consume.${randomUUID().slice(0, 8)}`
    const received: MqMessage[] = []
    const stop = await adapter.consume(
      queue,
      ['identity.user.*'],
      async (msg) => {
        received.push(msg)
      },
      { consumer: 'test-consumer' },
    )

    const sent = testMessage()
    await adapter.publish('identity.user.created', sent)

    await waitFor(() => received.length >= 1)
    expect(received[0].eventId).toBe(sent.eventId)
    expect(received[0].payload).toEqual({ keycloakSub: 'sub-1' })
    await stop()
  })

  it('handler 抛错 → nack 不重投(requeueOnError=false),后续消息不受影响', async () => {
    const queue = `test.nack.${randomUUID().slice(0, 8)}`
    const seen: string[] = []
    const stop = await adapter.consume(
      queue,
      ['identity.user.deleted'],
      async (msg) => {
        seen.push(msg.eventId)
        if ((msg.payload as { boom?: boolean }).boom) throw new Error('handler 失败')
      },
      { consumer: 'test-consumer', requeueOnError: false },
    )

    const bad = testMessage({ eventType: 'identity.user.deleted', payload: { boom: true } })
    const good = testMessage({ eventType: 'identity.user.deleted', payload: { boom: false } })
    await adapter.publish('identity.user.deleted', bad)
    await adapter.publish('identity.user.deleted', good)

    await waitFor(() => seen.includes(good.eventId))
    // bad 只被消费一次(未重投)
    expect(seen.filter((id) => id === bad.eventId)).toHaveLength(1)
    await stop()
  })
})

async function waitFor(cond: () => boolean, timeoutMs = 10_000) {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor 超时')
    await new Promise((r) => setTimeout(r, 50))
  }
}

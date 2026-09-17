import { randomUUID } from 'node:crypto'
import amqplib from 'amqplib'
import { describe, expect, it } from 'vitest'
import { createRabbitMqAdapter } from '@/lib/mq/rabbitmq-adapter'

const url = process.env.RABBITMQ_URL ?? 'amqp://identity:identity@localhost:5672'

async function fixture() {
  const mq = createRabbitMqAdapter(url)
  const conn = await amqplib.connect(url)
  const channel = await conn.createChannel()
  const queue = `test.recovery.${randomUUID()}`
  const failed = `${queue}.failed`
  return { mq, channel, queue, failed, async close() {
    await mq.close()
    await channel.deleteQueue(queue).catch(() => {})
    await channel.deleteQueue(failed).catch(() => {})
    await conn.close()
  } }
}
async function waitFor(check: () => Promise<boolean>) {
  const deadline = Date.now() + 10_000
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('waitFor timeout')
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

describe('durable fanout failure recovery', () => {
  it('handler 失败保留原消息，限量重放后成功；坏 JSON 也保留', async () => {
    const f = await fixture()
    let recovered = false
    const seen: string[] = []
    try {
      const stop = await f.mq.consume(f.queue, [], async msg => {
        if (!recovered) throw new Error('database unavailable')
        seen.push(msg.eventId)
      }, { consumer: 'test', failureQueue: f.failed })
      const event = { eventId: randomUUID(), eventType: 'test', eventVersion: 1, payload: { retained: true } }
      f.channel.sendToQueue(f.queue, Buffer.from(JSON.stringify(event)), { persistent: true })
      await waitFor(async () => (await f.channel.checkQueue(f.failed)).messageCount === 1)
      const saved = await f.channel.get(f.failed, { noAck: false })
      expect(saved && JSON.parse(saved.content.toString())).toEqual(event)
      if (saved) f.channel.nack(saved, false, true)
      await waitFor(async () => (await f.channel.checkQueue(f.failed)).messageCount === 1)
      recovered = true
      expect(await f.mq.replayFailed(f.failed, f.queue, 1)).toBe(1)
      await waitFor(async () => seen.length === 1)
      expect(seen).toEqual([event.eventId])
      f.channel.sendToQueue(f.queue, Buffer.from('invalid-json'), { persistent: true })
      await waitFor(async () => (await f.channel.checkQueue(f.failed)).messageCount === 1)
      const bad = await f.channel.get(f.failed, { noAck: false })
      expect(bad && bad.content.toString()).toBe('invalid-json')
      if (bad) f.channel.nack(bad, false, true)
      await stop()
    } finally { await f.close() }
  })

  it('转存目标丢失时不 ack 原消息，关闭消费通道并通知宿主', async () => {
    const f = await fixture()
    let fatal = false
    try {
      await f.mq.consume(f.queue, [], async () => {
        await f.channel.deleteQueue(f.failed)
        throw new Error('injected failure')
      }, { consumer: 'test', failureQueue: f.failed, onFatalError: () => { fatal = true } })
      f.channel.sendToQueue(f.queue, Buffer.from(JSON.stringify({ eventId: 'preserve-me' })), { persistent: true })
      await waitFor(async () => fatal && (await f.channel.checkQueue(f.queue)).messageCount === 1)
      const retained = await f.channel.get(f.queue, { noAck: true })
      expect(retained && JSON.parse(retained.content.toString()).eventId).toBe('preserve-me')
    } finally { await f.close() }
  })

  it('重放目标不存在时失败队列保持原样；非法上限不执行', async () => {
    const f = await fixture()
    try {
      await f.channel.assertQueue(f.failed, { durable: true, arguments: { 'x-queue-type': 'quorum' } })
      f.channel.sendToQueue(f.failed, Buffer.from('retained'), { persistent: true })
      await waitFor(async () => (await f.channel.checkQueue(f.failed)).messageCount === 1)
      await expect(f.mq.replayFailed(f.failed, f.queue, 1)).rejects.toThrow()
      expect((await f.channel.checkQueue(f.failed)).messageCount).toBe(1)
      await expect(f.mq.replayFailed(f.failed, f.queue, 0)).rejects.toThrow()
    } finally { await f.close() }
  })
})

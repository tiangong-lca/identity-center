import amqplib, { type Channel, type ChannelModel, type ConfirmChannel, type GetMessage, type ConsumeMessage } from 'amqplib'
import type { ConsumeHandler, ConsumeOptions, MqAdapter, MqMessage } from './types'

const EXCHANGE = 'identity.events'

/**
 * RabbitMQ 实现(总体架构 §11:Quorum Queue + publisher confirm):
 * topic exchange `identity.events`,durable + persistent 投递,at-least-once。
 */
export function createRabbitMqAdapter(url: string): MqAdapter & {
  replayFailed(source: string, target: string, limit: number): Promise<number>
} {
  let connection: ChannelModel | null = null
  let publishChannel: ConfirmChannel | null = null
  const consumerChannels: Channel[] = []

  async function getConnection(): Promise<ChannelModel> {
    if (!connection) {
      connection = await amqplib.connect(url)
      connection.on('error', (err) => {
        console.error('[mq] 连接错误:', err.message)
        connection = null
        publishChannel = null
      })
      connection.on('close', () => {
        connection = null
        publishChannel = null
      })
    }
    return connection
  }

  async function getPublishChannel(): Promise<ConfirmChannel> {
    if (!publishChannel) {
      const conn = await getConnection()
      publishChannel = await conn.createConfirmChannel()
      await publishChannel.assertExchange(EXCHANGE, 'topic', { durable: true })
    }
    return publishChannel
  }

  // 专用 confirm channel 将 mandatory return 与这一次转存绑定，避免并发消息串线。
  async function transfer(target: string, msg: GetMessage | ConsumeMessage) {
    const ch = await (await getConnection()).createConfirmChannel()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await new Promise<void>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('MQ transfer confirm timeout')), 15_000)
        let returned = false
        ch.once('return', () => { returned = true })
        ch.once('error', reject)
        ch.once('close', () => reject(new Error('MQ transfer channel closed')))
        ch.sendToQueue(target, msg.content, {
          ...msg.properties,
          // 不沿用原消息的 TTL，失败记录应保留到人工恢复。
          expiration: undefined,
          persistent: true,
          mandatory: true,
        }, (error) => {
          clearTimeout(timer)
          if (error) reject(error)
          else if (returned) reject(new Error('MQ transfer target is unavailable'))
          else resolve()
        })
      })
    } finally {
      clearTimeout(timer)
      await ch.close().catch(() => {})
    }
  }

  return {
    async publish(topic, message) {
      const ch = await getPublishChannel()
      const body = Buffer.from(JSON.stringify(message))
      ch.publish(EXCHANGE, topic, body, {
        persistent: true,
        contentType: 'application/json',
        messageId: message.eventId,
        type: message.eventType,
      })
      await ch.waitForConfirms()
    },

    async consume(queue, topics, handler: ConsumeHandler, options: ConsumeOptions) {
      if (options.failureQueue === queue) throw new Error('Failure queue must differ from source')
      const conn = await getConnection()
      const ch = await conn.createChannel()
      consumerChannels.push(ch)
      await ch.assertExchange(EXCHANGE, 'topic', { durable: true })
      await ch.assertQueue(queue, {
        durable: true,
        arguments: { 'x-queue-type': 'quorum' },
      })
      for (const topic of topics) await ch.bindQueue(queue, EXCHANGE, topic)
      await ch.prefetch(10)

      if (options.failureQueue) {
        await ch.assertQueue(options.failureQueue, {
          durable: true,
          arguments: { 'x-queue-type': 'quorum' },
        })
      }
      let stopping = false
      let failed = false
      const fatal = (error: unknown) => {
        if (stopping || failed) return
        failed = true
        console.error(`[mq] consumer ${options.consumer} stopped; unacked messages retained`)
        // 关闭通道让未确认的原消息回队；宿主必须重启以恢复消费。
        void ch.close().catch(() => {})
        options.onFatalError?.(error instanceof Error ? error : new Error(String(error)))
      }
      ch.on('error', fatal)
      ch.on('close', () => fatal(new Error('MQ consumer channel closed')))
      const { consumerTag } = await ch.consume(queue, (msg) => {
        if (!msg) { fatal(new Error('MQ consumer cancelled')); return }
        void (async () => {
          try {
            const parsed = JSON.parse(msg.content.toString()) as MqMessage
            await handler(parsed)
          } catch {
            if (options.failureQueue) {
              await transfer(options.failureQueue, msg)
              console.error(`[mq] consumer ${options.consumer}: message parked in ${options.failureQueue}`)
            } else {
              ch.nack(msg, false, options.requeueOnError ?? false)
              return
            }
          }
          ch.ack(msg)
        })().catch(fatal)
      })

      return async () => {
        stopping = true
        await ch.cancel(consumerTag).catch(() => {})
        await ch.close().catch(() => {})
      }
    },

    async replayFailed(source, target, limit) {
      if (source === target || !Number.isInteger(limit) || limit < 1 || limit > 1000) {
        throw new Error('Replay requires distinct queues and a limit between 1 and 1000')
      }
      const ch = await (await getConnection()).createChannel()
      ch.on('error', () => {})
      try {
        // 不自动声明目标：目标不存在时保留失败消息并报错。
        await ch.checkQueue(target)
        const snapshot = await ch.checkQueue(source)
        let replayed = 0
        for (let i = 0; i < Math.min(limit, snapshot.messageCount); i++) {
          const msg = await ch.get(source, { noAck: false })
          if (!msg) break
          await transfer(target, msg)
          ch.ack(msg)
          replayed++
        }
        return replayed
      } finally {
        await ch.close().catch(() => {})
      }
    },

    async healthCheck() {
      try {
        const ch = await getPublishChannel()
        await ch.checkExchange(EXCHANGE)
        return true
      } catch {
        return false
      }
    },

    async close() {
      for (const ch of consumerChannels) {
        await ch.close().catch(() => {})
      }
      await publishChannel?.close().catch(() => {})
      await connection?.close().catch(() => {})
      connection = null
      publishChannel = null
    },
  }
}

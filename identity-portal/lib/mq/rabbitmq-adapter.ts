import amqplib, { type Channel, type ChannelModel, type ConfirmChannel } from 'amqplib'
import type { ConsumeHandler, ConsumeOptions, MqAdapter, MqMessage } from './types'

const EXCHANGE = 'identity.events'

/**
 * RabbitMQ 实现(总体架构 §11:Quorum Queue + publisher confirm):
 * topic exchange `identity.events`,durable + persistent 投递,at-least-once。
 */
export function createRabbitMqAdapter(url: string): MqAdapter {
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

      const { consumerTag } = await ch.consume(queue, (msg) => {
        if (!msg) return
        let parsed: MqMessage
        try {
          parsed = JSON.parse(msg.content.toString()) as MqMessage
        } catch {
          // 无法解析的消息直接丢弃(由死信/对账兜底)
          ch.nack(msg, false, false)
          return
        }
        handler(parsed)
          .then(() => ch.ack(msg))
          .catch(() => ch.nack(msg, false, options.requeueOnError ?? false))
      })

      return async () => {
        await ch.cancel(consumerTag)
        await ch.close()
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

import type { MqMessage } from '@/lib/mq/types'
import { enqueueWebhookDeliveries } from './deliver-webhooks'
import type { JobContext } from './types'

/** 短暂故障最多尝试三次；耗尽后由 MQ 层持久化转存，不无限回队。 */
export async function consumeWebhookEvent(ctx: JobContext, message: MqMessage): Promise<void> {
  const delays = [1000, 2000]
  for (let attempt = 0; ; attempt++) {
    try {
      await enqueueWebhookDeliveries(ctx, message)
      return
    } catch (error) {
      const delay = delays[attempt]
      if (delay === undefined) throw error
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}

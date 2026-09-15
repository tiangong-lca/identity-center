/** 显式、有上限的恢复操作；不扫描或重置业务数据库。 */
import 'dotenv/config'
import { createRabbitMqAdapter } from '@/lib/mq/rabbitmq-adapter'

async function main() {
  const args = process.argv.slice(2)
  const limit = Number(args[1])
  if (args.length !== 2 || args[0] !== '--limit' || !Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error('Usage: pnpm exec tsx scripts/replay-webhook-fanout.ts --limit <1..1000>')
  }
  if (!process.env.RABBITMQ_URL) throw new Error('RABBITMQ_URL is required')
  const mq = createRabbitMqAdapter(process.env.RABBITMQ_URL)
  try {
    const count = await mq.replayFailed('identity.webhook-fanout.failed', 'identity.webhook-fanout', limit)
    console.log(`Requeued ${count} messages; verify delivery results before another batch`)
  } finally {
    await mq.close()
  }
}
main().catch(() => {
  // 不打印连接 URL 或消息内容，避免暴露凭证/用户信息。
  console.error('Fanout replay failed; check arguments, broker availability and queue names')
  process.exitCode = 1
})

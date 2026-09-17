import { afterEach, describe, expect, it, vi } from 'vitest'
import { enqueueWebhookDeliveries } from '@/server/jobs/deliver-webhooks'
import { consumeWebhookEvent } from '@/server/jobs/consume-webhook-event'
import type { JobContext } from '@/server/jobs/types'

vi.mock('@/server/jobs/deliver-webhooks', () => ({ enqueueWebhookDeliveries: vi.fn() }))
const enqueue = vi.mocked(enqueueWebhookDeliveries)
const event = { eventId: 'evt_retry', eventType: 'test', eventVersion: 1, payload: {} }
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks() })

describe('bounded fanout retry', () => {
  it('瞬时故障退避后恢复，不进行第三次调用', async () => {
    vi.useFakeTimers()
    enqueue.mockRejectedValueOnce(new Error('temporary')).mockResolvedValueOnce(1)
    const pending = consumeWebhookEvent({} as JobContext, event)
    await vi.advanceTimersByTimeAsync(999)
    expect(enqueue).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(enqueue).toHaveBeenCalledTimes(2)
    expect(enqueue.mock.calls.every(call => call[1] === event)).toBe(true)
  })
  it('持续故障仅三次尝试后抛回传输层保存', async () => {
    vi.useFakeTimers()
    const error = new Error('persistent')
    enqueue.mockRejectedValue(error)
    const failed = expect(consumeWebhookEvent({} as JobContext, event)).rejects.toBe(error)
    await vi.advanceTimersByTimeAsync(1000)
    expect(enqueue).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1999)
    expect(enqueue).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    await failed
    await vi.runAllTimersAsync()
    expect(enqueue).toHaveBeenCalledTimes(3)
  })
})

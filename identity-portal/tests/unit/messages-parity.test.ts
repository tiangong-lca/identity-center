import { describe, expect, it } from 'vitest'
import en from '@/messages/en.json'
import zh from '@/messages/zh-CN.json'

function keysOf(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null
      ? keysOf(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  )
}

describe('i18n messages', () => {
  it('zh-CN 与 en 的键完全一致', () => {
    expect(keysOf(zh as Record<string, unknown>).sort()).toEqual(
      keysOf(en as Record<string, unknown>).sort(),
    )
  })

  it('没有空翻译', () => {
    const all = [zh, en].flatMap((m) => keysOf(m as Record<string, unknown>))
    expect(all.length).toBeGreaterThan(0)
    const flatten = (obj: Record<string, unknown>): string[] =>
      Object.values(obj).flatMap((v) =>
        typeof v === 'object' && v !== null
          ? flatten(v as Record<string, unknown>)
          : [String(v)],
      )
    for (const value of [...flatten(zh as Record<string, unknown>), ...flatten(en as Record<string, unknown>)]) {
      expect(value.trim()).not.toBe('')
    }
  })
})

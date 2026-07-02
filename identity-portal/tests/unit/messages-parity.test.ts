import { describe, expect, it } from 'vitest'
import { loadMessages } from '@/i18n/messages-loader'

function keysOf(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null
      ? keysOf(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  )
}

function flatten(obj: Record<string, unknown>): string[] {
  return Object.values(obj).flatMap((v) =>
    typeof v === 'object' && v !== null ? flatten(v as Record<string, unknown>) : [String(v)],
  )
}

describe('i18n messages(目录合并制)', () => {
  const zh = loadMessages('zh-CN')
  const en = loadMessages('en')

  it('zh-CN 与 en 的键完全一致', () => {
    const zhKeys = keysOf(zh).sort()
    const enKeys = keysOf(en).sort()
    const missingInEn = zhKeys.filter((k) => !enKeys.includes(k))
    const missingInZh = enKeys.filter((k) => !zhKeys.includes(k))
    expect(missingInEn, `en 缺少: ${missingInEn.join(', ')}`).toHaveLength(0)
    expect(missingInZh, `zh-CN 缺少: ${missingInZh.join(', ')}`).toHaveLength(0)
  })

  it('没有空翻译', () => {
    for (const value of [...flatten(zh), ...flatten(en)]) {
      expect(value.trim()).not.toBe('')
    }
  })
})

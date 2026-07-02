import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { AppLocale } from './config'

type Messages = Record<string, unknown>

function deepMerge(target: Messages, source: Messages): Messages {
  for (const [key, value] of Object.entries(source)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof target[key] === 'object' &&
      target[key] !== null
    ) {
      target[key] = deepMerge(target[key] as Messages, value as Messages)
    } else {
      target[key] = value
    }
  }
  return target
}

/** 合并 messages/{locale}/ 目录下全部 JSON(按文件名排序,后者覆盖前者) */
export function loadMessages(locale: AppLocale): Messages {
  const dir = path.join(process.cwd(), 'messages', locale)
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
  let merged: Messages = {}
  for (const file of files) {
    const content = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as Messages
    merged = deepMerge(merged, content)
  }
  return merged
}

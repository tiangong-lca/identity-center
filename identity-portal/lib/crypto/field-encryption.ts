import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * PII 字段级加密(安全设计):AES-256-GCM,格式 `v1.<iv>.<tag>.<cipher>`(base64url)。
 * 密钥:32 字节,base64 编码于 env PII_ENCRYPTION_KEY。
 */
const VERSION = 'v1'

export function parseKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, 'base64')
  if (key.length !== 32) throw new Error('PII_ENCRYPTION_KEY 必须是 32 字节的 base64')
  return key
}

export function encryptField(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.')
}

export function decryptField(payload: string, key: Buffer): string {
  const [version, ivB64, tagB64, dataB64] = payload.split('.')
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('加密字段格式非法')
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

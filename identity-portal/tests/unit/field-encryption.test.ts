import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decryptField, encryptField, parseKey } from '@/lib/crypto/field-encryption'

describe('lib/crypto field-encryption', () => {
  const key = randomBytes(32)

  it('加解密回环', () => {
    const cipher = encryptField('13800138000', key)
    expect(cipher.startsWith('v1.')).toBe(true)
    expect(decryptField(cipher, key)).toBe('13800138000')
  })

  it('同明文两次加密产生不同密文(随机 IV)', () => {
    expect(encryptField('a', key)).not.toBe(encryptField('a', key))
  })

  it('篡改密文被 GCM tag 拒绝', () => {
    const cipher = encryptField('secret', key)
    const parts = cipher.split('.')
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith('AA') ? 'BB' : 'AA')
    expect(() => decryptField(parts.join('.'), key)).toThrow()
  })

  it('错误密钥解密失败', () => {
    const cipher = encryptField('secret', key)
    expect(() => decryptField(cipher, randomBytes(32))).toThrow()
  })

  it('parseKey 校验 32 字节', () => {
    expect(() => parseKey(Buffer.from('short').toString('base64'))).toThrow()
    expect(parseKey(randomBytes(32).toString('base64')).length).toBe(32)
  })
})

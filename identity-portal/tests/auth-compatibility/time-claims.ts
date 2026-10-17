import type { JWTPayload } from 'jose'

// Shared inputs keep token-age and exp rejection distinct in local and hosted proof.
export function timeNegatives(base: (name: string) => JWTPayload, now: number): Array<[string, JWTPayload]> {
  return [
    ['stale-iat', { ...base('stale-iat'), iat: now - 600 }],
    ['expired-exp', { ...base('expired-exp'), iat: now, exp: now - 600 }],
  ]
}

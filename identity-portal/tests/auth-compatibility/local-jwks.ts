import { createServer } from 'node:http'
import { once } from 'node:events'
import { generateKeyPair, exportJWK, SignJWT, type JWTPayload } from 'jose'
import { fixture } from './fixture'

/** Controlled adversarial JWKS fixture; separate from the required real Keycloak flow. */
export async function localJwks() {
  const c = fixture()
  const a = await generateKeyPair('RS256')
  const b = await generateKeyPair('RS256')
  const publicA = { ...(await exportJWK(a.publicKey)), kid: `${c.nonce}-a`, alg: 'RS256', use: 'sig' }
  const publicB = { ...(await exportJWK(b.publicKey)), kid: `${c.nonce}-b`, alg: 'RS256', use: 'sig' }
  let body: unknown = { keys: [publicA] }
  let requests = 0
  const server = createServer((req, res) => {
    if (req.url !== `/realms/${c.realm}/protocol/openid-connect/certs`) { res.writeHead(404).end(); return }
    requests++
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw Error('Owned JWKS listener did not bind')
  const origin = `http://127.0.0.1:${address.port}`
  const issuer = `${origin}/realms/${c.realm}`
  const sign = (claims: JWTPayload, key: 'a' | 'b' = 'a', kid?: string) => new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: kid ?? (key === 'a' ? publicA.kid : publicB.kid) })
    .sign(key === 'a' ? a.privateKey : b.privateKey)
  return {
    origin, issuer, sign, publicB, get requests() { return requests },
    setBody(value: unknown) { body = value },
    close: () => new Promise<void>((resolve, reject) => { server.close(e => e ? reject(e) : resolve()); server.closeAllConnections() }),
  }
}

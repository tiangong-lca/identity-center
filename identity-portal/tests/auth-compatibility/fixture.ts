import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { assertFixture } from './contract.mjs'

export interface Fixture {
  variant: 'baseline' | 'candidate'
  nonce: string
  project: string
  realm: string
  keycloakOrigin: string
  portalOrigin: string
  postgresOrigin: string
  redisOrigin: string
  directory: string
  evidenceDirectory: string
  masterPassword: string
  redisPassword: string
  postgresPassword: string
  authSecret: string
  userPassword: string
  email: string
  appPort: number
  portalSecret?: string
  adminApiSecret?: string
  qualificationCase?: 'auth-client' | 'catalog-yaml' | 'react19.3' | 'react19.3-catalog-fixed' | 'security-audit'
  browserAssets?: string[]
  yamlWorker?: { bootstrap: string; chunks: string[]; digests: Record<string, string> }
  securityBinding?: { source: string; manifestSha256: string; lockSha256: string; parserSha256: string; zod: {format:string;version:string;packageSha256:string;entrySha256:string;runtimeTreeSha256:string}; assets: { assets: Array<{ path: string; sha256: string }> } }
  userId?: string
}

export function fixture(): Fixture {
  assert.equal(process.platform, 'linux', 'Real auth fixture is hosted-Linux only')
  assert.equal(process.env.AUTH_PROOF_HOSTED, '1')
  const file = process.env.AUTH_PROOF_CONFIG
  assert.ok(file && path.isAbsolute(file))
  const c = JSON.parse(readFileSync(file, 'utf8')) as Fixture
  assertFixture(c)
  assert.equal(path.dirname(file), c.directory)
  assert.equal(c.evidenceDirectory, path.join(c.directory, 'evidence'))
  assert.ok(process.env.RUNNER_TEMP && c.directory.startsWith(`${process.env.RUNNER_TEMP}/identity34-`))
  assert.ok(Number.isInteger(c.appPort) && c.appPort > 1024)
  assert.ok(![c.keycloakOrigin, c.portalOrigin, c.postgresOrigin, c.redisOrigin].some(u => Number(new URL(u).port) === c.appPort))
  return c
}

export function receipt(name: string, data: unknown) {
  assert.match(name, /^[a-z-]+\.json$/)
  const c = fixture()
  writeFileSync(path.join(c.evidenceDirectory, name), JSON.stringify(data, null, 2), { mode: 0o600 })
}

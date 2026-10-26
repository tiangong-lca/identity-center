import { describe, expect, it } from 'vitest'
import { generateKeyPair, jwtVerify, SignJWT, type JWTPayload } from 'jose'
import { assertFixture, assertHostedContext, assertLocalOrigin, cleanEnvironment, composeDocument, IMAGE_TAGS, ownedLifecycle, redactor, lineRedactor, attemptCleanup, assertProductDelta, assertProductDeltaFromGit } from '../auth-compatibility/contract.mjs'
import { timeNegatives } from '../auth-compatibility/time-claims'

it('signs distinct stale-iat and past-exp inputs, with an otherwise accepted fresh-iat control', async () => {
  const now = 1_792_224_000
  const issuer = 'http://localhost:21001/realms/synthetic'
  const base = (sub: string): JWTPayload => ({ iss: issuer, aud: 'user-portal', sub, iat: now })
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const sign = (claims: JWTPayload) => new SignJWT(claims).setProtectedHeader({ alg: 'RS256' }).sign(privateKey)
  // The real handler's verification options, with a fixed clock only for this unit control.
  const options = { algorithms: ['RS256'], issuer, maxTokenAge: '2m', currentDate: new Date(now * 1000) }
  const cases = timeNegatives(base, now)
  expect(cases.map(([name]) => name)).toEqual(['stale-iat', 'expired-exp'])
  expect(cases[0][1]).not.toHaveProperty('exp')
  expect(cases[1][1]).toMatchObject({ iat: now, exp: now - 600 })
  for (const [name, claims] of cases) {
    await expect(jwtVerify(await sign(claims), publicKey, options), name).rejects.toMatchObject({
      code: 'ERR_JWT_EXPIRED', claim: name === 'stale-iat' ? 'iat' : 'exp', reason: 'check_failed',
    })
  }
  const fresh = { ...cases[1][1] }
  delete fresh.exp
  await expect(jwtVerify(await sign(fresh), publicKey, options)).resolves.toMatchObject({ payload: fresh })
})

function fixture() {
  const nonce = 'a'.repeat(20)
  return {
    variant: 'baseline', nonce, project: `identity34-baseline-${nonce}`, realm: `identity34-baseline-${nonce}`,
    keycloakOrigin: 'http://localhost:21001', portalOrigin: 'http://localhost:21002',
    redisOrigin: 'http://localhost:21003', postgresOrigin: 'http://localhost:21004',
    masterPassword: 'm'.repeat(40), redisPassword: 'r'.repeat(40), postgresPassword: 'p'.repeat(40),
    authSecret: 'a'.repeat(40), userPassword: 'u'.repeat(40), email: `identity34-baseline-${nonce}@test.local`,
  }
}

describe('hosted auth proof isolation', () => {
  it('refuses local/self-hosted execution and substituted checkout identities before Docker', () => {
    const head = 'a'.repeat(40)
    const env = { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', GITHUB_REPOSITORY: 'tiangong-lca/identity-center', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', AUTH_PROOF_HEAD: head, RUNNER_TEMP: '/tmp/runner' }
    expect(() => assertHostedContext(env, 'linux', head)).not.toThrow()
    for (const changed of [{ GITHUB_ACTIONS: '' }, { RUNNER_ENVIRONMENT: 'self-hosted' }, { AUTH_PROOF_HEAD: 'b'.repeat(40) }, { GITHUB_REPOSITORY: 'foreign/repo' }]) {
      expect(() => assertHostedContext({ ...env, ...changed }, 'linux', head)).toThrow()
    }
    expect(() => assertHostedContext(env, 'darwin', head)).toThrow()
  })

  it('rejects external/default/reused endpoints and foreign realm ownership', () => {
    for (const raw of ['https://localhost:21001', 'http://example.com:21001', 'http://u:p@localhost:21001', 'http://localhost:21001/path', 'http://localhost:21001?q=1']) expect(() => assertLocalOrigin(raw)).toThrow()
    expect(() => assertFixture({ ...fixture(), realm: 'company-dev' })).toThrow()
    expect(() => assertFixture({ ...fixture(), portalOrigin: fixture().keycloakOrigin })).toThrow()
  })

  it('renders only owned three services, loopback ports, digest pins and project storage', () => {
    const images = Object.fromEntries(Object.entries(IMAGE_TAGS).map(([name, tag]) => [name, `${tag}@sha256:${'a'.repeat(64)}`]))
    const c = composeDocument(fixture(), images, '/owned/theme')
    expect(Object.keys(c.services)).toEqual(['postgres', 'keycloak', 'redis'])
    expect(JSON.stringify(c)).not.toContain('external')
    expect(c.services.keycloak.volumes).toEqual(['/owned/theme:/opt/keycloak/themes:ro'])
    expect(Object.values(c.services).every(s => s.ports.every(p => p.startsWith('127.0.0.1:')))).toBe(true)
    expect(() => composeDocument(fixture(), { ...images, redis: 'redis:latest' }, '/owned/theme')).toThrow()
  })

  it('never inherits deployment, GitHub or dotenv credentials', () => {
    const env = cleanEnvironment({ PATH: '/bin', HOME: '/owned/home', GITHUB_TOKEN: 'secret', DATABASE_URL: 'prod', DOTENV_CONFIG_PATH: '/production.env', AWS_SECRET_ACCESS_KEY: 'secret' }, fixture(), '/owned/config.json')
    expect(env).not.toHaveProperty('GITHUB_TOKEN')
    expect(env).not.toHaveProperty('AWS_SECRET_ACCESS_KEY')
    expect(env.DOTENV_CONFIG_PATH).toBe('/owned/config.json.env')
    expect(env.KEYCLOAK_REALM).toBe(fixture().realm)
    expect(env.DATABASE_URL).not.toContain('prod')
  })

  it('cleans partial startup and surfaces cleanup failure alongside the original error', async () => {
    const called: string[] = []
    await expect(ownedLifecycle(async () => { called.push('setup'); throw Error('readiness') }, async () => { called.push('run') }, async () => { called.push('cleanup') })).rejects.toThrow('readiness')
    expect(called).toEqual(['setup', 'cleanup'])
    await expect(ownedLifecycle(async () => {}, async () => { throw Error('test failure') }, async () => { throw Error('cleanup') })).rejects.toThrow('Owned fixture cleanup failed')
  })

  it('redacts generated secrets and JWTs before evidence publication', () => {
    expect(redactor(['synthetic-secret'])('synthetic-secret eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln')).toBe('[REDACTED] [REDACTED_JWT]')
    expect(redactor([])('cookie: encrypted-value')).toBe('cookie: [REDACTED]')
    expect(redactor([])('eyJhbGciOiJkaXIifQ..aW52ZW50b3J5.Y2lwaGVy.dGFn')).toBe('[REDACTED_JWT]')
  })
})

// These checks protect the concrete published workflow, not a parallel template.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import { load } from 'js-yaml'

it('keeps hosted auth proof secretless, PR-head bound and absent from unrelated feature changes', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../../.github/workflows/auth-compatibility.yml'), 'utf8')
  const workflow = load(source) as {
    on: Record<string, { paths: string[] }>
    permissions: Record<string, string>
    jobs: Record<string, { 'runs-on': string; steps: Array<{ uses?: string; with?: Record<string, unknown> }> }>
  }
  expect(Object.keys(workflow.on)).toEqual(['pull_request'])
  expect(workflow.on.pull_request.paths).not.toContain('identity-portal/**')
  expect(workflow.on.pull_request.paths).not.toContain('**')
  expect(workflow.permissions).toEqual({ contents: 'read' })
  const job = workflow.jobs['auth-compatibility']
  expect(job['runs-on']).toBe('ubuntu-24.04')
  expect(job.steps.find(step => step.uses?.startsWith('actions/setup-node@'))?.with?.['node-version']).toBe('24.22.1')
  expect(job.steps[0].with?.ref).toBe('${{ github.event.pull_request.head.sha }}')
  expect(job.steps[0].with?.['persist-credentials']).toBe(false)
  expect(source).not.toMatch(/secrets\.|pull_request_target|workflow_dispatch/)
  expect(fs.readFileSync(path.resolve(__dirname, '../../../.github/workflows/ci.yml'), 'utf8')).not.toContain('auth-compatibility')
})

it('attempts Docker removal and every inventory even if process shutdown and down fail', async () => {
  const calls: string[] = []
  const actions: Array<[string, () => Promise<unknown>]> = [
    ['relay', async () => { calls.push('relay'); throw Error('close failed') }],
    ['portal', async () => { calls.push('portal'); throw Error('termination failed') }],
    ['docker', async () => { calls.push('docker'); throw Error('down failed') }],
    ...['containers', 'volumes', 'networks'].map(kind => [kind, async () => { calls.push(kind); return [] }] as [string, () => Promise<unknown>]),
  ]
  const result = await attemptCleanup(actions)
  expect(calls).toEqual(['relay', 'portal', 'docker', 'containers', 'volumes', 'networks'])
  expect(result.failures.map(f => f.name)).toEqual(['relay', 'portal', 'docker'])
  expect(result.results.networks).toEqual([])
})

it('redacts secrets split across process output chunks before any disk append', () => {
  const written: string[] = []
  const capture = lineRedactor(['synthetic-secret'], (value: string) => written.push(value))
  capture.data('prefix synthetic-')
  capture.data('secret\nlast cookie: a-private-cookie')
  capture.flush()
  expect(written.join('')).toBe('prefix [REDACTED]\nlast cookie: [REDACTED]')
})

it('the actual orchestrator rejects local invocation before a Docker transport can run', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'identity34-local-refusal-'))
  const marker = path.join(tmp, 'docker-called')
  fs.writeFileSync(path.join(tmp, 'docker'), `#!/bin/sh\ntouch '${marker}'\n`, { mode: 0o700 })
  try {
    expect(() => execFileSync(process.execPath, [path.resolve(__dirname, '../auth-compatibility/run.mjs')], {
      env: { PATH: `${tmp}:${process.env.PATH}`, RUNNER_TEMP: tmp, NODE_ENV: 'test' }, stdio: 'pipe', timeout: 10_000,
    })).toThrow()
    expect(fs.existsSync(marker)).toBe(false)
  } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
})


it('allows governed review metadata without admitting product or deployment-policy rewrites', () => {
  expect(() => assertProductDelta('deploy/runbooks/README.md', '---\nreview: old\n---\nmanual deployment', '---\nreview: new\n---\nmanual deployment')).not.toThrow()
  expect(() => assertProductDelta('deploy/runbooks/README.md', '---\nreview: old\n---\nmanual deployment', '---\nreview: new\n---\nautomatic deployment')).toThrow()
  expect(() => assertProductDelta('lib/auth/auth-config.ts', 'old', 'new')).toThrow()
})


it('admits only the exact reviewed runbook CI correction, never deployment config or another document', () => {
  const file = 'identity-portal/deploy/runbooks/README.md'
  const root = path.resolve(__dirname, '../../..')
  // The ordinary quality checkout is shallow; test data must not require ancestors.
  const fixtureSource = fs.readFileSync(path.resolve(__dirname, '../auth-compatibility/fixtures/runbook-before-ci-proof.json'), 'utf8')
  expect(Buffer.byteLength(fixtureSource, 'utf8')).toBeLessThan(16 * 1024)
  const original = JSON.parse(fixtureSource) as { sourceCommit: string; sourcePath: string; content: string }
  expect(original.sourceCommit).toBe('d9b4827c961967fe16ef31c365025049c7ff8802')
  expect(original.sourcePath).toBe(file)
  const before = original.content
  const after = fs.readFileSync(path.join(root, file), 'utf8')
  expect(() => assertProductDelta(file, before, after)).not.toThrow()
  expect(() => assertProductDelta(file, before, `${after}\nAllow production deployment.`)).toThrow()
  expect(() => assertProductDelta('identity-portal/deploy/runbooks/deployment.md', before, after)).toThrow()
  expect(() => assertProductDelta('identity-portal/deploy/docker/docker-compose.prod.yml', before, after)).toThrow()
  expect(() => assertProductDelta(file, before.replace('Identity #26', 'Identity #99'), after)).toThrow()
})

it('admits the exact reviewed Node24 Dockerfile, rejects other image or build-policy changes', () => {
  const file = 'identity-portal/deploy/docker/Dockerfile'
  const original = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../auth-compatibility/fixtures/dockerfile-before-node24.json'), 'utf8')) as { sourceCommit: string; sourcePath: string; content: string }
  expect(original.sourceCommit).toBe('104135f3aae4d39cebef13a9f12abfc53daed376')
  expect(original.sourcePath).toBe(file)
  const after = fs.readFileSync(path.resolve(__dirname, '../../../', file), 'utf8')
  expect(() => assertProductDelta(file, original.content, after)).not.toThrow()
  for (const changed of [after.replace('24.22.1-alpine', '25-alpine'), after.replace(' pnpm-workspace.yaml', ''), `${after}\nRUN echo unreviewed\n`]) {
    expect(() => assertProductDelta(file, original.content, changed)).toThrow()
  }
  expect(() => assertProductDelta(file, original.content.replace('22-alpine', '22-slim'), after)).toThrow()
  expect(() => assertProductDelta('identity-portal/deploy/docker/docker-compose.prod.yml', original.content, after)).toThrow()
})


it('preserves real Git blob newlines at the orchestrator extraction boundary', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'identity41-git-blobs-'))
  const file = 'identity-portal/deploy/docker/Dockerfile'
  const before = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../auth-compatibility/fixtures/dockerfile-before-node24.json'), 'utf8')).content as string
  const after = fs.readFileSync(path.resolve(__dirname, '../../../', file), 'utf8')
  const env = { PATH: process.env.PATH, HOME: root, GIT_CONFIG_NOSYSTEM: '1', NODE_ENV: 'test' as const }
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, env, encoding: 'utf8' }).trim()
  try {
    git('init', '--quiet')
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), before)
    const oldBlob = git('hash-object', '-w', file)
    // Git trees avoid requiring ancestor commits, hooks, or a user identity.
    git('update-index', '--add', '--cacheinfo', `100644,${oldBlob},${file}`)
    const oldRef = git('write-tree')
    fs.writeFileSync(path.join(root, file), after)
    git('add', '--', file)
    const newRef = git('write-tree')
    expect(() => assertProductDeltaFromGit(file, oldRef, newRef, { cwd: root, env })).not.toThrow()
    expect(() => assertProductDelta(file, before.trim(), after.trim())).toThrow('Unexpected original Dockerfile')
    fs.writeFileSync(path.join(root, file), after.trimEnd())
    git('add', '--', file)
    expect(() => assertProductDeltaFromGit(file, oldRef, git('write-tree'), { cwd: root, env })).toThrow('Only the exact reviewed Node24 Dockerfile')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

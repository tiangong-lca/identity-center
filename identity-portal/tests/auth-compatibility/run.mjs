import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { randomBytes, createHash } from 'node:crypto'
import { once } from 'node:events'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertHostedContext, assertFixture, IMAGE_TAGS, composeDocument, cleanEnvironment, redactor, lineRedactor, attemptCleanup, ownedLifecycle, compareReceipts } from './contract.mjs'

import { qualificationCase, assertQualificationSources, assertQualificationManifest, assertQualificationVersions, assertQualificationProductDeltaFromGit } from './qualification-case.mjs'

const selectedCase = qualificationCase(process.env.AUTH_PROOF_CASE)
const BASELINE = selectedCase.baseline
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const infraEnv = Object.fromEntries(['PATH', 'HOME', 'USER', 'LANG'].filter(k => process.env[k]).map(k => [k, process.env[k]]))
const git = (...args) => execFileSync('git', ['-C', sourceRoot, ...args], { env: { ...infraEnv, GIT_NO_LAZY_FETCH: '1' } }).toString().trim()
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const abort = new AbortController()
const secrets = new Set()
const redact = value => redactor(secrets)(value)
let output
let cancelled = false
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { cancelled = true; abort.abort() })

async function execute(command, args, { cwd = sourceRoot, env = infraEnv, name, timeout = 180_000, cleanup = false } = {}) {
  if (!cleanup && cancelled) throw Error(`Cancelled before ${name}`)
  const log = path.join(output, `${name}.log`)
  const started = Date.now()
  const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const capture = lineRedactor(secrets, text => fs.appendFileSync(log, text))
  const onData = data => capture.data(data.toString())
  child.stdout.on('data', onData)
  child.stderr.on('data', onData)
  let hardKill
  const stop = () => {
    try { process.kill(-child.pid, 'SIGTERM') } catch {}
    hardKill ??= setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL') } catch {} }, 2000)
  }
  if (!cleanup) abort.signal.addEventListener('abort', stop, { once: true })
  const timer = setTimeout(stop, timeout)
  let error
  let code
  try { [code] = await once(child, 'close') } catch (e) { error = e } finally {
    clearTimeout(timer)
    if (hardKill) clearTimeout(hardKill)
    abort.signal.removeEventListener('abort', stop)
  }
  capture.flush()
  const result = { command, args, exitCode: code, durationMs: Date.now() - started, cancelled, envKeys: Object.keys(env).sort() }
  fs.writeFileSync(path.join(output, `${name}.receipt.json`), JSON.stringify(result, null, 2))
  if (error || code !== 0 || (!cleanup && cancelled)) throw Error(`Step ${name} failed; see sanitized evidence`)
  return fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim() : ''
}

async function freePort() {
  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve()))
  return address.port
}

async function newFixture(variant, root) {
  const nonce = randomBytes(10).toString('hex')
  const project = `identity34-${variant}-${nonce}`
  const ports = new Set()
  while (ports.size < 5) ports.add(await freePort())
  const [kc, portal, redis, pg, app] = [...ports]
  const directory = path.join(root, variant)
  const c = { variant, nonce, project, realm: project, directory, evidenceDirectory: path.join(directory, 'evidence'),
    keycloakOrigin: `http://localhost:${kc}`, portalOrigin: `http://localhost:${portal}`,
    redisOrigin: `http://localhost:${redis}`, postgresOrigin: `http://localhost:${pg}`, appPort: app,
    email: `${project}@test.local`, ...Object.fromEntries(['masterPassword', 'redisPassword', 'postgresPassword', 'authSecret', 'userPassword'].map(k => [k, randomBytes(32).toString('base64url')])) }
  assertFixture(c)
  fs.mkdirSync(c.evidenceDirectory, { recursive: true, mode: 0o700 })
  for (const k of ['masterPassword', 'redisPassword', 'postgresPassword', 'authSecret', 'userPassword']) secrets.add(c[k])
  return c
}

async function startRelay(c) {
  const server = http.createServer((req, res) => {
    const forward = body => {
      const upstream = http.request({ hostname: '127.0.0.1', port: c.appPort, path: req.url, method: req.method,
        headers: { ...req.headers, host: new URL(c.portalOrigin).host, 'x-forwarded-host': new URL(c.portalOrigin).host, 'x-forwarded-proto': 'http' } }, response => {
        if (body) {
          let projection = { tokenShape: {}, ownedSubject: false, status: response.statusCode }
          try {
            const token = new URLSearchParams(body.toString()).get('logout_token') ?? ''
            secrets.add(token)
            const [h, p] = token.split('.')
            const header = JSON.parse(Buffer.from(h, 'base64url'))
            const claims = JSON.parse(Buffer.from(p, 'base64url'))
            projection = { status: response.statusCode, ownedSubject: claims.sub === c.userId,
              tokenShape: { algorithm: header.alg, hasSub: typeof claims.sub === 'string', hasSid: typeof claims.sid === 'string', hasExp: claims.exp !== undefined, hasEvent: Boolean(claims.events?.['http://schemas.openid.net/event/backchannel-logout']) } }
          } catch {}
          fs.writeFileSync(path.join(c.evidenceDirectory, 'callback.json'), JSON.stringify(projection, null, 2))
        }
        res.writeHead(response.statusCode ?? 502, response.headers)
        response.pipe(res)
      })
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() })
      if (body) upstream.end(body)
      else req.pipe(upstream)
    }
    if (req.url === '/api/auth/backchannel-logout' && req.method === 'POST') {
      const chunks = []
      let size = 0
      req.on('data', chunk => { size += chunk.length; if (size > 65536) req.destroy(); else chunks.push(chunk) })
      req.on('end', () => forward(Buffer.concat(chunks)))
    } else forward()
  })
  server.listen(Number(new URL(c.portalOrigin).port), '0.0.0.0')
  await once(server, 'listening')
  return () => new Promise((resolve, reject) => {
    if (!server.listening) { resolve(); return }
    server.close(e => e ? reject(e) : resolve()); server.closeAllConnections()
  })
}

function ownsListeningPort(pid, port) {
  const sockets = new Set(fs.readdirSync(`/proc/${pid}/fd`).flatMap(fd => {
    try { const link = fs.readlinkSync(`/proc/${pid}/fd/${fd}`); return link.startsWith('socket:[') ? [link.slice(8, -1)] : [] } catch { return [] }
  }))
  return ['/proc/net/tcp', '/proc/net/tcp6'].some(file => fs.readFileSync(file, 'utf8').split('\n').slice(1).some(line => {
    const f = line.trim().split(/\s+/)
    return f[3] === '0A' && parseInt(f[1]?.split(':')[1], 16) === port && sockets.has(f[9])
  }))
}

async function startPortal(c, app, env) {
  const standalone = path.join(app, '.next/standalone')
  fs.cpSync(path.join(app, 'public'), path.join(standalone, 'public'), { recursive: true })
  fs.cpSync(path.join(app, '.next/static'), path.join(standalone, '.next/static'), { recursive: true })
  const child = spawn(process.execPath, [path.join(standalone, 'server.js')], {
    cwd: standalone, env: { ...env, NODE_ENV: 'production', PORT: String(c.appPort), HOSTNAME: '127.0.0.1' }, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  const log = path.join(output, `${c.variant}-portal.log`)
  const capture = lineRedactor(secrets, text => fs.appendFileSync(log, text))
  for (const stream of [child.stdout, child.stderr]) stream.on('data', d => capture.data(d.toString()))
  let closed = false
  let processError
  const closedPromise = new Promise(resolve => {
    child.once('close', () => { closed = true; resolve() })
    child.once('error', error => { processError = error; resolve() })
  })
  const stop = async () => {
    try {
      if (!closed && child.pid) {
        try { process.kill(-child.pid, 'SIGTERM') } catch {}
        await Promise.race([closedPromise, new Promise(resolve => setTimeout(resolve, 4000))])
        if (!closed) {
          try { process.kill(-child.pid, 'SIGKILL') } catch {}
          await Promise.race([closedPromise, new Promise(resolve => setTimeout(resolve, 3000))])
        }
      }
      if (processError || !closed) throw Error('Owned Portal termination was not confirmed')
    } finally { capture.flush() }
  }
  try {
    for (let n = 0; n < 100; n++) {
      if (cancelled || child.exitCode !== null) throw Error('Owned Portal exited before readiness')
      if (ownsListeningPort(child.pid, c.appPort)) {
        try {
          const response = await fetch(`http://127.0.0.1:${c.appPort}/api/auth/providers`, { signal: AbortSignal.timeout(1000) })
          if (response.ok && (await response.json()).keycloak) return stop
        } catch { /* a bounded readiness retry against the verified owned listener */ }
      }
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    throw Error('Owned Portal readiness timeout')
  } catch (e) { await stop(); throw e }
}

async function resources(c, kind) {
  const args = kind === 'containers' ? ['ps', '-a', '-q'] : kind === 'volumes' ? ['volume', 'ls', '-q'] : ['network', 'ls', '-q']
  const text = await execute('docker', [...args, '--filter', `label=com.docker.compose.project=${c.project}`], { name: `${c.variant}-inventory-${kind}-${randomBytes(2).toString('hex')}`, cleanup: true, timeout: 15000 })
  return text ? text.split('\n') : []
}

async function variant(variant, root, images, head) {
  const c = await newFixture(variant, root)
  const checkout = path.join(c.directory, 'source')
  fs.mkdirSync(checkout)
  const archive = execFileSync('git', ['-C', sourceRoot, 'archive', variant === 'baseline' ? BASELINE : head], { env: { ...infraEnv, GIT_NO_LAZY_FETCH: '1' }, maxBuffer: 100 * 1024 * 1024 })
  execFileSync('tar', ['-xf', '-', '-C', checkout], { input: archive, env: infraEnv })
  const app = path.join(checkout, 'identity-portal')
  // Identical test support runs against both exact application sources and frozen graphs.
  fs.cpSync(path.join(sourceRoot, 'identity-portal/tests/auth-compatibility'), path.join(app, 'tests/auth-compatibility'), { recursive: true })
  fs.copyFileSync(path.join(sourceRoot, 'identity-portal/tests/integration/keycloak-bootstrap.test.ts'), path.join(app, 'tests/integration/keycloak-bootstrap.test.ts'))
  assert.equal(fs.readdirSync(app).some(name => /^\.env(?:\.|$)/.test(name)), false, 'Never load a pre-existing dotenv file')
  const configFile = path.join(c.directory, 'fixture.json')
  fs.writeFileSync(configFile, JSON.stringify(c), { mode: 0o600 })
  fs.writeFileSync(`${configFile}.env`, '', { mode: 0o600 })
  let env = { ...cleanEnvironment(process.env, c, configFile), AUTH_PROOF_CASE: selectedCase.name }
  const compose = path.join(c.directory, 'compose.json')
  fs.writeFileSync(compose, JSON.stringify(composeDocument(c, images, path.join(app, 'deploy/keycloak/themes'))), { mode: 0o600 })
  const docker = (args, name, cleanup = false) => execute('docker', ['compose', '-p', c.project, '-f', compose, ...args], { name: `${variant}-${name}`, timeout: cleanup ? 25_000 : 240_000, cleanup })
  const pnpm = (args, name, timeout = 300_000) => execute('pnpm', args, { cwd: app, env, name: `${variant}-${name}`, timeout })
  let owned = false
  let stopPortal = async () => {}
  let stopRelay = async () => {}
  const summary = { project: c.project, realm: c.realm, images, source: variant === 'baseline' ? BASELINE : head, cleanup: { passed: false } }
  try {
    await ownedLifecycle(async () => {
      for (const kind of ['containers', 'volumes', 'networks']) assert.deepEqual(await resources(c, kind), [], 'Refuse a pre-existing project')
      // Cryptographic project names plus explicit absence establish task ownership before startup.
      owned = true
      await docker(['up', '-d', '--wait', '--wait-timeout', '180', 'postgres', 'keycloak', 'redis'], 'startup')
      const inventory = await docker(['ps', '--format', 'json'], 'started-inventory')
      fs.writeFileSync(path.join(c.evidenceDirectory, 'startup.json'), inventory)
    }, async () => {
      await pnpm(['install', '--frozen-lockfile'], 'frozen')
      const versions = Object.fromEntries(['next', 'react', 'react-dom', '@types/react', '@types/react-dom', 'jose', '@keycloak/keycloak-admin-client'].map(name => [name, JSON.parse(fs.readFileSync(path.join(app, 'node_modules', name, 'package.json'))).version]))
      assertQualificationVersions(selectedCase.name, variant, versions)
      summary.versions = versions; summary.fixtureMode = 'synthetic-owned-local-only'; summary.lockSha256 = hash(path.join(app, 'pnpm-lock.yaml'))
      await docker(['exec', '-T', 'postgres', 'createdb', '-U', 'identityproof', 'identity_portal'], 'create-portal-db')
      await pnpm(['bootstrap:keycloak'], 'bootstrap')
      await pnpm(['db:migrate'], 'migrate')
      await pnpm(['exec', 'tsx', 'tests/auth-compatibility/prepare.ts'], 'prepare')
      Object.assign(c, JSON.parse(fs.readFileSync(configFile, 'utf8')))
      secrets.add(c.portalSecret); secrets.add(c.adminApiSecret)
      env = { ...env, KEYCLOAK_CLIENT_SECRET: c.portalSecret, KEYCLOAK_ADMIN_API_CLIENT_SECRET: c.adminApiSecret }
      await pnpm(['exec', 'vitest', 'run', '--project', 'integration', 'tests/integration/keycloak-admin.test.ts', 'tests/integration/keycloak-bootstrap.test.ts'], 'existing-admin-pkce')
      await pnpm(['build'], 'build')
      stopPortal = await startPortal(c, app, env)
      stopRelay = await startRelay(c)
      await pnpm(['exec', 'playwright', 'install', '--with-deps', 'chromium'], 'browser-install')
      await pnpm(['exec', 'playwright', 'test', '--config', 'tests/auth-compatibility/playwright.config.ts'], 'actual-browser')
      await pnpm(['exec', 'vitest', 'run', '--config', 'tests/auth-compatibility/vitest.config.ts', 'tests/auth-compatibility/transport.integration.test.ts'], 'route-controls')
      await stopRelay(); stopRelay = async () => {}
      await stopPortal(); stopPortal = async () => {}
      await docker(['stop', 'redis'], 'owned-redis-stop')
      env = { ...env, AUTH_PROOF_REDIS_STOPPED: c.project }
      await pnpm(['exec', 'vitest', 'run', '--config', 'tests/auth-compatibility/vitest.config.ts', 'tests/auth-compatibility/redis-outage.integration.test.ts'], 'actual-redis-outage')
      for (const name of ['browser', 'transport', 'outage', ...(selectedCase.name === 'react19.3' ? ['ui'] : [])]) summary[name] = JSON.parse(fs.readFileSync(path.join(c.evidenceDirectory, `${name}.json`)))
    }, async () => {
      const actions = [['relay', stopRelay], ['portal', stopPortal]]
      if (owned) {
        actions.push(['docker', () => docker(['down', '--volumes', '--remove-orphans', '--timeout', '5'], 'cleanup', true)])
        for (const kind of ['containers', 'volumes', 'networks']) actions.push([kind, () => resources(c, kind)])
      }
      const cleanup = await attemptCleanup(actions)
      const remaining = Object.fromEntries(['containers', 'volumes', 'networks'].map(kind => [kind, cleanup.results[kind] ?? ['inventory unavailable']]))
      summary.cleanup = { passed: owned && cleanup.failures.length === 0 && Object.values(remaining).every(v => v.length === 0), remaining,
        failures: cleanup.failures.map(f => ({ action: f.name, message: redact(f.error instanceof Error ? f.error.message : f.error) })) }
      assert.equal(summary.cleanup.passed, true, 'Owned cleanup or inventory failed')
    })
    return summary
  } finally {
    fs.writeFileSync(path.join(output, `${variant}-summary.json`), JSON.stringify(summary, null, 2))
    fs.cpSync(c.evidenceDirectory, path.join(output, variant), { recursive: true })
  }
}

async function readinessFailureControl(root, images) {
  const c = await newFixture('baseline', path.join(root, 'readiness-control'))
  const file = path.join(c.directory, 'compose.json')
  const document = composeDocument(c, images, path.join(sourceRoot, 'identity-portal/deploy/keycloak/themes'))
  document.services.keycloak.healthcheck.test = ['CMD-SHELL', 'exit 1']
  fs.writeFileSync(file, JSON.stringify(document), { mode: 0o600 })
  let owned = false
  let startupFailed = false
  let cleaned = false
  const command = args => ['compose', '-p', c.project, '-f', file, ...args]
  try {
    await ownedLifecycle(async () => {
      for (const kind of ['containers', 'volumes', 'networks']) assert.deepEqual(await resources(c, kind), [])
      owned = true
      try {
        await execute('docker', command(['up', '-d', '--wait', '--wait-timeout', '20', 'postgres', 'keycloak', 'redis']), { name: 'readiness-control-start', timeout: 40_000 })
      } catch (e) { startupFailed = true; throw e }
      throw Error('Deliberately unhealthy service unexpectedly passed readiness')
    }, async () => { throw Error('Readiness failure must prevent auth operations') }, async () => {
      if (!owned) return
      const actions = [['docker', () => execute('docker', command(['down', '--volumes', '--remove-orphans', '--timeout', '5']), { name: 'readiness-control-cleanup', timeout: 25_000, cleanup: true })]]
      for (const kind of ['containers', 'volumes', 'networks']) actions.push([kind, () => resources(c, kind)])
      const cleanup = await attemptCleanup(actions)
      cleaned = cleanup.failures.length === 0 && ['containers', 'volumes', 'networks'].every(kind => cleanup.results[kind]?.length === 0)
      fs.writeFileSync(path.join(output, 'readiness-control-cleanup.json'), JSON.stringify({ project: c.project, passed: cleaned,
        remaining: Object.fromEntries(['containers', 'volumes', 'networks'].map(kind => [kind, cleanup.results[kind] ?? ['inventory unavailable']])),
        failures: cleanup.failures.map(f => f.name) }, null, 2))
      assert.equal(cleaned, true, 'Readiness control cleanup/inventory failed')
    })
  } catch (e) {
    if (!startupFailed || !cleaned || cancelled) throw e
  }
  assert.equal(startupFailed && cleaned, true)
  const result = { project: c.project, deliberateReadinessFailure: true, authOperationsStarted: false, cleanupPassed: true }
  fs.writeFileSync(path.join(output, 'readiness-failure-control.json'), JSON.stringify(result, null, 2))
  return result
}

async function main() {
  const head = git('rev-parse', 'HEAD')
  const validateOnly = process.argv.length === 3 && process.argv[2] === '--validate-sources'
  assert.ok(process.argv.length === 2 || validateOnly, 'Unknown proof arguments')
  if (!validateOnly) assertHostedContext(process.env, process.platform, head)
  assertQualificationSources(selectedCase.name, { baseline: BASELINE, head, requestedHead: process.env.AUTH_PROOF_HEAD, ancestor: git('merge-base', BASELINE, head) === BASELINE })
  assert.equal(git('status', '--porcelain'), '', 'Qualify a clean exact source checkout')
  const changedProduct = git('diff', '--name-only', BASELINE, head, '--', 'identity-portal/app', 'identity-portal/lib', 'identity-portal/server', 'identity-portal/components', 'identity-portal/features', 'identity-portal/db', 'identity-portal/scripts', 'identity-portal/deploy', 'identity-portal/messages', 'identity-portal/next.config.ts', 'identity-portal/proxy.ts', ...(selectedCase.name === 'react19.3' ? ['identity-portal/i18n', 'identity-portal/types', 'identity-portal/public', 'identity-portal/pnpm-workspace.yaml', 'identity-portal/tsconfig.json', 'identity-portal/postcss.config.mjs', 'identity-portal/components.json', '.nvmrc'] : []))
  for (const file of changedProduct ? changedProduct.split('\n') : []) {
    assertQualificationProductDeltaFromGit(selectedCase.name, file, BASELINE, head, { cwd: sourceRoot, env: infraEnv })
  }
  const baselineManifest = execFileSync('git', ['-C', sourceRoot, 'show', `${BASELINE}:identity-portal/package.json`], { env: infraEnv }).toString()
  assertQualificationManifest(selectedCase.name, baselineManifest, JSON.parse(git('show', `${head}:identity-portal/package.json`)))
  if (validateOnly) {
    console.log(JSON.stringify({ validationOnly: true, qualificationCase: selectedCase.name, baseline: BASELINE, head, dockerAccessed: false }))
    return
  }
  assert.equal(process.version, 'v24.22.1', 'Use the reviewed Node24 LTS runtime')
  output = path.join(process.env.RUNNER_TEMP, `identity34-evidence-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`)
  fs.mkdirSync(output, { mode: 0o700 })
  const root = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP, 'identity34-owned-'))
  const images = {}
  try {
    const pnpmVersion = await execute('pnpm', ['--version'], { name: 'pnpm-version' })
    assert.equal(pnpmVersion, '11.9.0')
    fs.writeFileSync(path.join(output, 'source.json'), JSON.stringify({ qualificationCase: selectedCase.name, head, baseline: BASELINE, node: process.version, pnpm: pnpmVersion }, null, 2))
    await execute('docker', ['version', '--format', '{{.Server.Version}}'], { name: 'docker-preflight' })
    await execute('docker', ['compose', 'version'], { name: 'compose-preflight' })
    for (const [name, tag] of Object.entries(IMAGE_TAGS)) {
      await execute('docker', ['pull', tag], { name: `pull-${name}` })
      const metadata = JSON.parse(await execute('docker', ['image', 'inspect', tag, '--format', '{{json .RepoDigests}}'], { name: `image-${name}` }))
      assert.ok(metadata[0]?.match(/@sha256:[a-f0-9]{64}$/))
      images[name] = `${tag}@${metadata[0].split('@')[1]}`
      const platform = await execute('docker', ['image', 'inspect', tag, '--format', '{{.Id}} {{.Os}}/{{.Architecture}}'], { name: `platform-${name}` })
      assert.match(platform, / linux\/amd64$/, 'Use native Linux x64 service images')
    }
    const readinessControl = await readinessFailureControl(root, images)
    const baseline = await variant('baseline', root, images, head)
    const candidate = await variant('candidate', root, images, head)
    assert.equal(cancelled, false, 'Cancelled proof cannot qualify')
    const comparison = compareReceipts(baseline, candidate)
    if (selectedCase.name === 'react19.3') {
      assert.equal(baseline.ui.passed, true); assert.equal(candidate.ui.passed, true)
      assert.deepEqual(candidate.ui, baseline.ui, 'Unexpected standalone UI compatibility delta')
    }
    fs.writeFileSync(path.join(output, 'qualification.json'), JSON.stringify({ qualificationCase: selectedCase.name, head, baseline: BASELINE, images, readinessControl, comparison, baselineReceipt: baseline, candidateReceipt: candidate }, null, 2))
    console.log(JSON.stringify({ qualificationCase: selectedCase.name, head, baseline: BASELINE, comparison, evidence: output }))
  } catch (e) {
    fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ qualificationCase: selectedCase.name, head, baseline: BASELINE, cancelled, message: redact(e instanceof Error ? e.message : e) }, null, 2))
    throw e
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
}

main().catch(e => { console.error(redact(e instanceof Error ? e.message : e)); process.exitCode = 1 })

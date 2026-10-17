import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

export const BASELINE = 'd9b4827c961967fe16ef31c365025049c7ff8802'
export const REPOSITORY = 'tiangong-lca/identity-center'
export const IMAGE_TAGS = {
  postgres: 'postgres:17-alpine',
  keycloak: 'quay.io/keycloak/keycloak:26.5',
  redis: 'redis:7-alpine',
}

export function assertHostedContext(env, platform, head) {
  assert.equal(platform, 'linux', 'Docker proof runs only on hosted Linux')
  assert.equal(env.GITHUB_ACTIONS, 'true', 'Local Docker activation is prohibited')
  assert.equal(env.RUNNER_ENVIRONMENT, 'github-hosted', 'Use an ephemeral hosted runner')
  assert.equal(env.GITHUB_REPOSITORY, REPOSITORY)
  assert.match(env.GITHUB_RUN_ID ?? '', /^\d+$/)
  assert.match(env.GITHUB_RUN_ATTEMPT ?? '', /^\d+$/)
  assert.match(head, /^[a-f0-9]{40}$/)
  assert.equal(env.AUTH_PROOF_HEAD, head, 'Proof must execute the exact requested head')
  assert.ok(env.RUNNER_TEMP?.startsWith('/'), 'RUNNER_TEMP must be absolute')
}

export function assertLocalOrigin(raw) {
  const u = new URL(raw)
  assert.equal(u.protocol, 'http:')
  assert.ok(['localhost', '127.0.0.1'].includes(u.hostname), 'Only explicit loopback fixtures')
  assert.ok(Number(u.port) > 1024 && Number(u.port) <= 65535, 'Use a task-owned dynamic port')
  assert.equal(u.username + u.password + u.search + u.hash, '')
  assert.equal(u.pathname, '/')
  return u.origin
}

export function assertFixture(c) {
  assert.ok(['baseline', 'candidate'].includes(c.variant))
  assert.match(c.nonce, /^[a-f0-9]{20}$/)
  assert.equal(c.project, `identity34-${c.variant}-${c.nonce}`)
  assert.equal(c.realm, c.project)
  for (const name of ['keycloakOrigin', 'portalOrigin', 'redisOrigin', 'postgresOrigin']) {
    assert.equal(assertLocalOrigin(c[name]), c[name])
  }
  assert.equal(new URL(c.portalOrigin).hostname, 'localhost', 'Bootstrap host substitution requires localhost')
  const ports = ['keycloakOrigin', 'portalOrigin', 'redisOrigin', 'postgresOrigin'].map(k => new URL(c[k]).port)
  assert.equal(new Set(ports).size, ports.length)
  for (const key of ['masterPassword', 'redisPassword', 'postgresPassword', 'authSecret', 'userPassword']) {
    assert.match(c[key], /^[A-Za-z0-9_-]{32,}$/)
  }
  assert.equal(c.email, `${c.project}@test.local`)
  return c
}

export function composeDocument(c, images, theme) {
  assertFixture(c)
  for (const [name, tag] of Object.entries(IMAGE_TAGS)) {
    assert.match(images[name], new RegExp(`^${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@sha256:[a-f0-9]{64}$`))
  }
  const port = key => Number(new URL(c[key]).port)
  const label = { 'org.tiangong.identity-proof': c.project }
  return {
    name: c.project,
    services: {
      postgres: {
        image: images.postgres,
        environment: { POSTGRES_USER: 'identityproof', POSTGRES_PASSWORD: c.postgresPassword, POSTGRES_DB: 'identityproof' },
        ports: [`127.0.0.1:${port('postgresOrigin')}:5432`],
        volumes: ['postgres-data:/var/lib/postgresql/data'], labels: label,
        healthcheck: { test: ['CMD-SHELL', 'pg_isready -U identityproof -d identityproof'], interval: '2s', timeout: '2s', retries: 60 },
      },
      keycloak: {
        image: images.keycloak, command: ['start-dev'],
        environment: {
          KC_BOOTSTRAP_ADMIN_USERNAME: 'identityproof', KC_BOOTSTRAP_ADMIN_PASSWORD: c.masterPassword,
          KC_DB: 'postgres', KC_DB_URL: 'jdbc:postgresql://postgres:5432/identityproof',
          KC_DB_USERNAME: 'identityproof', KC_DB_PASSWORD: c.postgresPassword,
          KC_HEALTH_ENABLED: 'true', KC_HTTP_ENABLED: 'true', KC_PROXY_HEADERS: 'xforwarded',
        },
        ports: [`127.0.0.1:${port('keycloakOrigin')}:8080`],
        volumes: [`${theme}:/opt/keycloak/themes:ro`],
        extra_hosts: ['host.docker.internal:host-gateway'],
        depends_on: { postgres: { condition: 'service_healthy' } }, labels: label,
        healthcheck: {
          test: ['CMD-SHELL', "exec 3<>/dev/tcp/127.0.0.1/9000 && printf 'GET /health/ready HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n' >&3 && cat <&3 | grep -q UP"],
          interval: '3s', timeout: '3s', retries: 60,
        },
      },
      redis: {
        image: images.redis,
        environment: { REDIS_PASSWORD: c.redisPassword },
        volumes: ['redis-data:/data'],
        command: ['sh', '-c', 'exec redis-server --appendonly yes --protected-mode yes --requirepass "$$REDIS_PASSWORD" --rename-command CONFIG "" --rename-command FLUSHDB "" --rename-command FLUSHALL ""'],
        ports: [`127.0.0.1:${port('redisOrigin')}:6379`], labels: label,
        healthcheck: { test: ['CMD-SHELL', 'REDISCLI_AUTH="$$REDIS_PASSWORD" redis-cli ping | grep -q PONG'], interval: '2s', timeout: '2s', retries: 30 },
      },
    },
    volumes: { 'postgres-data': { labels: label }, 'redis-data': { labels: label } },
    networks: { default: { labels: label } },
  }
}

export function cleanEnvironment(base, c, ownedEnvPath) {
  assertFixture(c)
  const env = {}
  for (const name of ['PATH', 'HOME', 'USER', 'LANG', 'CI', 'COREPACK_HOME', 'PNPM_HOME', 'XDG_CACHE_HOME', 'TMPDIR', 'RUNNER_TEMP']) {
    if (base[name]) env[name] = base[name]
  }
  return {
    ...env, CI: 'true', NEXT_TELEMETRY_DISABLED: '1', DOTENV_CONFIG_PATH: `${ownedEnvPath}.env`,
    npm_config_userconfig: '/dev/null', AUTH_PROOF_CONFIG: ownedEnvPath, AUTH_PROOF_HOSTED: '1',
    KEYCLOAK_BASE_URL: c.keycloakOrigin, KEYCLOAK_REALM: c.realm,
    KEYCLOAK_ADMIN_USERNAME: 'identityproof', KEYCLOAK_ADMIN_PASSWORD: c.masterPassword,
    KEYCLOAK_CLIENT_ID: 'user-portal', KEYCLOAK_ADMIN_API_CLIENT_ID: 'user-portal-admin-api',
    PORTAL_ORIGIN: c.portalOrigin, AUTH_URL: c.portalOrigin, KC_BACKCHANNEL_HOST: 'host.docker.internal',
    KC_VERIFY_EMAIL: 'false', AUTH_SECRET: c.authSecret,
    REDIS_URL: `redis://:${c.redisPassword}@127.0.0.1:${new URL(c.redisOrigin).port}`,
    DATABASE_URL: `postgres://identityproof:${c.postgresPassword}@127.0.0.1:${new URL(c.postgresOrigin).port}/identity_portal`,
    PG_ADMIN_URL: `postgres://identityproof:${c.postgresPassword}@127.0.0.1:${new URL(c.postgresOrigin).port}/identityproof`,
    SEED_ADMIN_EMAIL: c.email, SEED_ADMIN_PASSWORD: c.userPassword,
    TIANGONG_LCA_GOTRUE_CALLBACK: `${c.portalOrigin}/unused-business/callback`,
    TIANGONG_LCA_APP_ORIGIN: c.portalOrigin, CMS_APP_ORIGIN: c.portalOrigin,
  }
}

export function redactor(secrets) {
  return value => {
    let s = String(value)
    for (const secret of secrets) if (secret) s = s.split(secret).join('[REDACTED]')
    return s.replace(/\beyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]*){2,4}\b/g, '[REDACTED_JWT]')
      .replace(/((?:set-cookie|cookie|authorization)\s*[:=]\s*)[^\r\n]+/gi, '$1[REDACTED]')
  }
}

export function lineRedactor(secrets, append) {
  let pending = ''
  const redact = redactor(secrets)
  return {
    data(value) {
      pending += String(value)
      const end = pending.lastIndexOf('\n')
      if (end >= 0) { append(redact(pending.slice(0, end + 1))); pending = pending.slice(end + 1) }
    },
    flush() { if (pending) append(redact(pending)); pending = '' },
  }
}

/** @param {Array<[string, () => Promise<unknown>]>} actions */
export async function attemptCleanup(actions) {
  /** @type {Array<{name: string, error: unknown}>} */
  const failures = []
  /** @type {Record<string, unknown>} */
  const results = {}
  for (const [name, action] of actions) {
    try { results[name] = await action() } catch (error) { failures.push({ name, error }) }
  }
  return { failures, results }
}

export async function ownedLifecycle(setup, run, cleanup) {
  let failure
  try { await setup(); return await run() } catch (e) { failure = e; throw e } finally {
    try { await cleanup() } catch (e) {
      throw new AggregateError(failure ? [failure, e] : [e], 'Owned fixture cleanup failed')
    }
  }
}

export function assertProductDelta(file, before, after) {
  assert.match(file, /\.md$/, 'Application/server source changes require another scope')
  const body = value => value.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
  if (body(after) === body(before)) return
  // Exact non-executable CI-description correction reviewed for Identity #34.
  // No other runbook body or executable/configuration change is admitted.
  assert.equal(file, 'identity-portal/deploy/runbooks/README.md')
  const digest = value => createHash('sha256').update(body(value).trim()).digest('hex')
  assert.equal(digest(before), '2531b2c5f61601e571fd3ba1734da758fc0708656929684dea3dd63295f47b37', 'Unexpected original runbook body')
  assert.equal(digest(after), 'aed127df51a5fe03bc24def2df602ecb58e16ffb884aadcc71885fbda06ef73c', 'Only the exact reviewed CI description may differ')
}

export function compareReceipts(baseline, candidate) {
  assert.deepEqual(candidate.images, baseline.images, 'Both runtimes must use the same immutable images')
  assert.deepEqual(candidate.transport, baseline.transport, 'Unexpected auth/diagnostic compatibility delta')
  assert.deepEqual(candidate.browser, baseline.browser, 'Unexpected actual Keycloak/OIDC/session delta')
  for (const r of [baseline, candidate]) {
    assert.equal(r.cleanup.passed, true)
    assert.equal(r.browser.sessionDenied, true, 'Actual pre-existing Auth.js session must be denied')
    assert.equal(r.browser.backchannelObserved, true)
    assert.equal(r.transport.subSessionDenied, true)
    assert.equal(r.transport.wrongRedisPasswordRejected, true)
    assert.equal(r.outage.rejected, true)
  }
  return {
    compatibleObservedFlows: true,
    knownLimitations: baseline.transport.sidOnly.sessionDenied ? [] : [{
      kind: 'baseline-sid-only-revocation',
      baseline: baseline.transport.sidOnly, candidate: candidate.transport.sidOnly,
      acceptance: 'Requires owner disposition; no SID-only session-denial claim or product fix',
    }],
  }
}

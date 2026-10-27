import { assertFixture, composeDocument } from './contract.mjs'

export const READINESS_CONTROL_WAIT_SECONDS = 20
export const OWNED_HEALTH_FORMAT = '{{.Id}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}'

export function badReadinessDocument(c, images, theme) {
  const document = composeDocument(c, images, theme)
  // Fail in the engine before Compose's deadline path can return a false zero.
  // All normal fixture health policies remain untouched.
  return { ...document, services: { ...document.services,
    keycloak: { ...document.services.keycloak,
      healthcheck: { test: ['CMD-SHELL', 'exit 1'], retries: 1, interval: '1s', timeout: '1s', start_period: '0s' },
    },
  } }
}

export function ownedKeycloakId(text) {
  if (typeof text !== 'string' || !/^[a-f0-9]{64}$/.test(text.trim())) {
    throw Error('Expected exactly one full owned Keycloak container identity')
  }
  return text.trim()
}

export function ownedHealthProjection(project, containerId, text) {
  if (typeof project !== 'string' || typeof containerId !== 'string' || !/^identity34-baseline-[a-f0-9]{20}$/.test(project) || !/^[a-f0-9]{64}$/.test(containerId) || typeof text !== 'string') {
    throw Error('Invalid owned health identity')
  }
  const parsed = /^([a-f0-9]{64}) (created|restarting|running|removing|paused|exited|dead) (none|starting|healthy|unhealthy)$/.exec(text.trim())
  if (!parsed || parsed[1] !== containerId) throw Error('Invalid owned health projection')
  return { project, service: 'keycloak', containerId, status: parsed[2], health: parsed[3] }
}

export async function observeBadKeycloakHealth(c, docker) {
  assertFixture(c)
  // Selection proves ownership before inspecting an immutable full container ID.
  // Inspect emits only engine identity/status enums, never Env, Config or Health.Log.
  const selected = await docker(['ps', '-a', '-q', '--no-trunc', '--filter', `label=com.docker.compose.project=${c.project}`, '--filter', 'label=com.docker.compose.service=keycloak'], 'owned-keycloak')
  const containerId = ownedKeycloakId(selected)
  const text = await docker(['inspect', '--type', 'container', '--format', OWNED_HEALTH_FORMAT, containerId], 'owned-keycloak-health')
  return ownedHealthProjection(c.project, containerId, text)
}

export function classifyBadReadinessRejection(project, startupLog) {
  if (typeof project !== 'string' || !/^identity34-baseline-[a-f0-9]{20}$/.test(project) || typeof startupLog !== 'string') return 'unclassified'
  // Classify only an exact terminal CLI rejection already retained by execute.
  // No container logs, arbitrary prose or error text enters the health receipt.
  const terminal = startupLog.slice(-16_384).replace(/\u001b\[[0-9;]*[A-Za-z]/g, '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).at(-1)
  const expected = `container ${project}-keycloak-1 is unhealthy`
  return terminal === expected || terminal === `dependency failed to start: ${expected}` ? 'owned-keycloak-unhealthy' : 'unclassified'
}

export function assertBadReadinessResult({ project, exitCode, startupRejection, health, healthRecorded, cleaned, cancelled }) {
  if (typeof project !== 'string' || !/^identity34-baseline-[a-f0-9]{20}$/.test(project) || cancelled || startupRejection !== 'owned-keycloak-unhealthy' || !Number.isInteger(exitCode) || exitCode < 1 || exitCode > 255 || !healthRecorded || !cleaned) {
    throw Error('Bad readiness control requires a verified nonzero exit and retained cleanup/health evidence')
  }
  if (!health || health.project !== project || health.service !== 'keycloak' || typeof health.containerId !== 'string' || !/^[a-f0-9]{64}$/.test(health.containerId) || health.status !== 'running' || health.health !== 'unhealthy') {
    throw Error('Bad readiness control requires its owned Keycloak to be observed running and unhealthy')
  }
}

export function requireExpectedBadReadinessError(error, startupError, result) {
  if (error !== startupError) throw error
  assertBadReadinessResult(result)
}

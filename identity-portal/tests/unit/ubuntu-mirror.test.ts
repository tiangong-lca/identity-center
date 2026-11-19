import { expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'
import { canonicalUbuntuMirrors, assertUbuntuMirrorContext } from '../auth-compatibility/ubuntu-mirror.mjs'

const archive = 'https://archive.ubuntu.com/ubuntu/\tpriority:2\n'
const security = 'https://security.ubuntu.com/ubuntu/\tpriority:3\n'

it('selects only the two existing signed Ubuntu HTTPS endpoints without changing their metadata', () => {
  for (const cloud of ['azure.archive.ubuntu.com', 'us-east-2.ec2.archive.ubuntu.com']) {
    expect(canonicalUbuntuMirrors(`http://${cloud}/ubuntu/\tpriority:1\n${archive}${security}`)).toBe(archive + security)
  }
  expect(canonicalUbuntuMirrors(archive + security)).toBe(archive + security)
})

it('fails closed for unknown/private sources, missing fallbacks, duplicate or altered metadata', () => {
  for (const text of [archive, archive + security + archive, archive + security + 'https://private.invalid/\tpriority:1\n', archive + security + 'https://user:owned-secret@archive.ubuntu.com/ubuntu/\tpriority:1\n', archive.replace('priority:2', 'trusted:yes') + security]) {
    expect(() => canonicalUbuntuMirrors(text)).toThrow()
    try { canonicalUbuntuMirrors(text) } catch (error) { expect(String(error)).not.toContain('owned-secret') }
  }
})

it('requires the exact native ephemeral GitHub repository/head context before host configuration access', () => {
  const head = 'a'.repeat(40)
  const env = { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', GITHUB_REPOSITORY: 'tiangong-lca/identity-center', GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1', RUNNER_TEMP: '/owned' }
  expect(() => assertUbuntuMirrorContext(env, 'linux', 'x64', head, head)).not.toThrow()
  for (const args of [[{}, 'linux', 'x64', head, head], [env, 'darwin', 'x64', head, head], [env, 'linux', 'arm64', head, head], [env, 'linux', 'x64', 'b'.repeat(40), head], [{ ...env, GITHUB_REPOSITORY: 'other/repo' }, 'linux', 'x64', head, head]] as const) {
    expect(() => assertUbuntuMirrorContext(...args)).toThrow()
  }
})

it('uses the bounded helper before original images/transports and preserves the setup receipt without changing job budgets', () => {
  const workflow = load(fs.readFileSync(path.resolve(__dirname, '../../../.github/workflows/auth-compatibility.yml'), 'utf8')) as { jobs: { 'auth-compatibility': { 'timeout-minutes': number; steps: Array<{ name?: string; run?: string; if?: string; with?: { path?: string } }> } } }
  const job = workflow.jobs['auth-compatibility']
  const mirror = job.steps.findIndex(step => step.name === 'Prefer the existing canonical Ubuntu HTTPS mirror')
  const image = job.steps.findIndex(step => step.name === 'Build and inspect isolated Node24 Portal and Worker images')
  const transport = job.steps.findIndex(step => step.name === 'Qualify isolated baseline and candidate auth transports')
  expect(mirror).toBeGreaterThan(-1)
  expect(mirror).toBeLessThan(image)
  expect(image).toBeLessThan(transport)
  expect(job['timeout-minutes']).toBe(45)
  expect(job.steps[mirror].run).toContain("ubuntu-mirror.mjs --apply --head '${{ github.event.pull_request.head.sha }}'")
  const upload = job.steps.find(step => step.name === 'Preserve sanitized proof and cleanup receipts')
  expect(upload?.if).toBe('always()')
  expect(upload?.with?.path).toContain('identity58-apt-mirror.json')
})

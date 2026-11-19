import { expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'
import { ubuntuMirrorPlan, assertUbuntuMirrorContext, writeAndVerifyUbuntuMirror } from '../auth-compatibility/ubuntu-mirror.mjs'

const archive = 'https://archive.ubuntu.com/ubuntu/\tpriority:2\n'
const security = 'https://security.ubuntu.com/ubuntu/\tpriority:3\n'

const sources = 'Types: deb\nURIs: mirror+file:/etc/apt/apt-mirrors.txt\nSuites: noble noble-updates noble-backports\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n'
const ec2 = `http://us-east-2.ec2.archive.ubuntu.com/ubuntu/\tpriority:1\n${archive}${security}`

it('changes only the exact observed EC2 mirror profile, retaining both existing HTTPS entries', () => {
  expect(ubuntuMirrorPlan(ec2, sources)).toEqual({ changed: true, reason: 'observed-ec2-regional-entry-removed', text: archive + security })
})

it('records fixed non-applicable reasons for healthy Azure, direct sources, missing files and new formats without a write plan', () => {
  const azure = ec2.replace('us-east-2.ec2.archive.ubuntu.com', 'azure.archive.ubuntu.com')
  for (const [mirrors, config] of [[azure, sources], [archive + security, sources], [null, sources], [ec2, null], [ec2, sources.replace('mirror+file:/etc/apt/apt-mirrors.txt', 'https://archive.ubuntu.com/ubuntu/')], [ec2 + 'https://new.example/\tpriority:4\n', sources], [ec2.replace('priority:1', 'priority:0'), sources], ['https://user:owned-secret@example.invalid/\n', sources]] as const) {
    const plan = ubuntuMirrorPlan(mirrors, config)
    expect(plan.changed).toBe(false)
    expect(plan).not.toHaveProperty('text')
    expect(JSON.stringify(plan)).not.toContain('owned-secret')
  }
})

it('propagates actual write/read-back failures instead of converting them into non-applicable success', () => {
  let current: Buffer = Buffer.from(ec2)
  const after = Buffer.from(archive + security)
  const config = Buffer.from(sources)
  const io = { readMirrors: () => current, readSources: () => config, writeMirrors: (bytes: Buffer) => { current = bytes } }
  expect(() => writeAndVerifyUbuntuMirror(Buffer.from(ec2), after, config, io)).not.toThrow()
  current = Buffer.from(ec2)
  expect(() => writeAndVerifyUbuntuMirror(current, after, config, { ...io, writeMirrors: () => { throw Object.assign(new Error('owned write denied'), { code: 'EACCES' }) } })).toThrow('owned write denied')
  expect(() => writeAndVerifyUbuntuMirror(current, after, config, { ...io, writeMirrors: () => {} })).toThrow('read-back')
  current = Buffer.from(ec2)
  expect(() => writeAndVerifyUbuntuMirror(current, after, config, { ...io, readSources: () => Buffer.from('changed signing configuration') })).toThrow('signing')
  expect(() => writeAndVerifyUbuntuMirror(current, after, config, { ...io, readMirrors: () => { throw new Error('owned read denied') } })).toThrow('owned read denied')
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

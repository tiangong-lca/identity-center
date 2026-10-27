import { expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn, execFileSync } from 'node:child_process'
import { load } from 'js-yaml'

const portal = path.resolve(__dirname, '../..')
const workflow = load(fs.readFileSync(path.join(portal, '../.github/workflows/auth-compatibility.yml'), 'utf8')) as {
  jobs: Record<string, { 'timeout-minutes': number; steps: Array<{ name?: string; run?: string; 'timeout-minutes'?: number }> }>
}
const imageStep = workflow.jobs['auth-compatibility'].steps.find(s => s.name?.startsWith('Build and inspect'))!

// Only Docker and two read-only Git queries are modeled. Execute the published
// workflow, proof CLI, traps and supervisor with the existing shorter deadlines.
const source = 'c'.repeat(40)
const fakeDocker = `#!${process.execPath}
const fs = require('node:fs'), assert = require('node:assert/strict'), a = process.argv.slice(2), p = process.env.FAKE_STATE
const s = JSON.parse(fs.readFileSync(p, 'utf8')), mode = process.env.FAKE_MODE
// Publish a complete sibling file before replacing the polled path.
// The reader must see either whole state, never writeFileSync's truncation window.
const publish = () => {
  const temporary = p + '.' + process.pid + '.tmp'
  fs.writeFileSync(temporary, JSON.stringify(s))
  fs.renameSync(temporary, p)
}
s.calls.push(a)
const imageId = target => 'sha256:' + (target === 'runner' ? 'a' : 'b').repeat(64)
let input
if (a[0] === 'run') {
  assert.equal(a[a.indexOf('--network') + 1], 'none')
  assert.ok(a.includes('--rm') && a.includes('--read-only'))
  assert.equal(a[a.indexOf('--cap-drop') + 1], 'ALL')
  assert.equal(a[a.indexOf('--security-opt') + 1], 'no-new-privileges')
  assert.equal(a[a.indexOf('--entrypoint') + 1], 'node')
  assert.ok(a.includes('-e'))
  input = JSON.parse(a.at(-1))
  assert.ok(['runner', 'worker'].includes(input.target))
  assert.equal(input.expected.source, process.env.FAKE_SOURCE)
  assert.equal(input.imageId, imageId(input.target))
  assert.equal(a[a.indexOf('-e') - 1], input.imageId)
  assert.equal(a[a.indexOf('--name') + 1], 'identity41-node24-123-1-' + input.target)
  assert.ok(s.images.includes('identity41-node24-123-1:' + input.target))
  s.phases.push('inspection-start:' + input.target)
}
const cleanup = s.builds === 2 || s.failed
const hang = cleanup && ((mode === 'hang-remove' && a[0] === 'image' && a[1] === 'rm' && a[2].endsWith(':runner')) || (mode === 'hang-info' && a[0] === 'info') || (mode === 'hang-inventory' && a[0] === 'container' && a[1] === 'ls'))
let rc = 0
if (hang || (mode === 'cancel' && a[0] === 'run')) {
  if (mode === 'cancel') s.containers.push(a[a.indexOf('--name') + 1])
  s.hungPids.push(process.pid)
  publish()
  process.on('SIGTERM', () => {})
  setInterval(() => {}, 1000)
} else {
  if (a[0] === 'info') {}
  else if (a[0] === 'build') {
    s.phases.push('build-start:' + (a[a.indexOf('--tag') + 1].endsWith(':runner') ? 'runner' : 'worker'))
    if (mode === 'build-fail' && a[a.indexOf('--tag') + 1].endsWith(':worker')) { rc = 7; s.failed = true }
    else { s.builds++; s.images.push(a[a.indexOf('--tag') + 1]) }
  } else if (a[0] === 'run') {
    s.phases.push('inspection-complete:' + input.target)
    console.log(JSON.stringify({ schema: 1, target: input.target, source: input.expected.source, imageId: input.imageId,
      nodeVersion: 'v24.22.1', platform: 'linux', arch: 'x64', filesystem: { schema: 1, target: input.target,
      source: input.expected.source, scope: 'image-root-filesystem', hostExpectedInputHashes: input.expected.inputHashes,
      frameworkVendor: input.expected.frameworkVendor } }))
  }
  else if (a[1] === 'inspect') {
    const present = (a[0] === 'image' ? s.images : s.containers).includes(a[2])
    rc = present ? 0 : 1
    if (present) console.log(imageId(a[2].endsWith(':runner') ? 'runner' : 'worker') + ' linux/amd64')
  } else if (a[1] === 'ls') {
    const filter = a[a.indexOf('--filter') + 1]
    const name = filter.slice(filter.indexOf('=') + 1).replace(/^\\^\\//, '').replace(/\\$$/, '')
    if ((a[0] === 'image' ? s.images : s.containers).includes(name)) console.log('synthetic-id')
  } else if (a[0] === 'image' && a[1] === 'rm') {
    if (mode === 'cleanup-fail') rc = 8
    else s.images = s.images.filter(v => v !== a[2])
  } else if (a[0] === 'rm') s.containers = s.containers.filter(v => v !== a[2])
  else throw Error(JSON.stringify(a))
  publish(); process.exit(rc)
}
`
type State = { images: string[]; containers: string[]; builds: number; calls: string[][]; hungPids: number[]; phases: string[] }
async function control(mode: string) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'identity41-image-control-'))
  const prefix = 'identity41-node24-123-1'
  fs.writeFileSync(path.join(tmp, 'docker'), fakeDocker, { mode: 0o700 })
  // No production Git guard is changed: this owned executable supports exactly
  // the two clean-source read queries used by the actual image-proof CLI.
  fs.writeFileSync(path.join(tmp, 'git'), `#!${process.execPath}
const a=process.argv.slice(2);if(a[0]==='-C')a.splice(0,2)
if(a.join(' ')==='rev-parse HEAD')process.stdout.write(${JSON.stringify(source)}+'\\n')
else if(a.join(' ')==='status --porcelain'){}
else process.exit(96)
`, { mode: 0o700 })
  const inertGit = path.join(tmp, 'git')
  expect(execFileSync(inertGit, ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: 'pipe' }).trim()).toBe(source)
  expect(execFileSync(inertGit, ['-C', path.resolve(portal, '..'), 'status', '--porcelain'], { encoding: 'utf8', stdio: 'pipe' })).toBe('')
  try {
    execFileSync(inertGit, ['status', '--short'], { stdio: 'pipe' })
    expect.fail('The inert Git executable must refuse every unsupported query')
  } catch (error) { expect((error as { status?: number }).status).toBe(96) }
  const stateFile = path.join(tmp, 'state.json')
  const initial: State = { images: mode === 'preexisting' ? [`${prefix}:runner`] : [], containers: [], builds: 0, calls: [], hungPids: [], phases: [] }
  fs.writeFileSync(stateFile, JSON.stringify(initial))
  expect(imageStep['timeout-minutes']).toBe(28)
  expect(workflow.jobs['auth-compatibility']['timeout-minutes']).toBe(45)
  const script = imageStep.run!.replace(/bounded_docker (5000|15000|60000|600000)/g, 'bounded_docker 1500').replace('"$deadline" 2000', '"$deadline" 100')
  fs.writeFileSync(path.join(tmp, 'step.sh'), script)
  const child = spawn('bash', [path.join(tmp, 'step.sh')], {
    cwd: portal, detached: true, stdio: 'pipe',
    env: { ...process.env, PATH: `${tmp}:${process.env.PATH}`, FAKE_STATE: stateFile, FAKE_MODE: mode, FAKE_SOURCE: source, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', RUNNER_TEMP: tmp },
  })
  let stderr = ''
  child.stdout.resume()
  child.stderr.on('data', v => { stderr += v })
  let cancel: ReturnType<typeof setInterval> | undefined
  if (mode === 'cancel') cancel = setInterval(() => {
    if (JSON.parse(fs.readFileSync(stateFile, 'utf8')).hungPids.length) {
      process.kill(-child.pid!, 'SIGTERM'); clearInterval(cancel)
    }
  }, 10)
  const observer = setTimeout(() => { try { process.kill(-child.pid!, 'SIGKILL') } catch {} }, 8000)
  try {
    const code = await new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('close', resolve) })
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8')) as State
    const receiptFile = path.join(tmp, 'identity41-image-evidence-123-1/cleanup.json')
    const receipt = fs.existsSync(receiptFile) ? JSON.parse(fs.readFileSync(receiptFile, 'utf8')) : null
    for (const pid of state.hungPids) expect(() => process.kill(pid, 0), `${mode}: transport ${pid} survived`).toThrow()
    if (mode === 'preexisting') {
      expect(code).toBe(1); expect(state.images).toEqual(initial.images)
      expect(state.calls.some(a => ['build', 'rm', 'run'].includes(a[0]) || a[1] === 'rm')).toBe(false)
      expect(receipt).toBeNull(); expect(state.phases).toEqual([])
    } else {
      // Reaching the intended phase is mandatory; an earlier invalid-image or
      // source-guard failure must not masquerade as a cleanup/deadline result.
      const completed = state.phases.filter(phase => phase.startsWith('inspection-complete:'))
      expect(completed).toEqual(mode === 'cancel' ? [] : mode === 'build-fail' ? ['inspection-complete:runner'] : ['inspection-complete:runner', 'inspection-complete:worker'])
      expect(state.phases).toContain('inspection-start:runner')
      if (mode === 'build-fail') expect(state.phases).toContain('build-start:worker')
      if (mode === 'cancel') {
        expect(state.hungPids.length).toBeGreaterThan(0)
        expect(fs.existsSync(path.join(path.dirname(receiptFile), 'runner-security.json'))).toBe(false)
        expect(fs.existsSync(path.join(path.dirname(receiptFile), 'runner-node.txt'))).toBe(false)
      }
      expect(receipt, stderr).toMatchObject({ cleanupCompleted: true })
      expect(code, stderr).toBe(mode === 'success' ? 0 : mode === 'build-fail' ? 7 : mode === 'cancel' ? 143 : 1)
      expect(receipt.ownedImagesAndContainersRemoved).toBe(['success', 'build-fail', 'cancel'].includes(mode))
      for (const target of ['runner', 'worker']) {
        expect(state.calls.some(a => a[0] === 'container' && a[1] === 'ls' && a.includes(`name=^/${prefix}-${target}$`))).toBe(true)
        expect(state.calls.some(a => a[0] === 'image' && a[1] === 'ls' && a.includes(`reference=${prefix}:${target}`))).toBe(true)
      }
      if (mode === 'hang-remove') {
        expect(state.images).toEqual([`${prefix}:runner`])
        expect(state.calls.some(a => a[0] === 'image' && a[1] === 'rm' && a[2] === `${prefix}:worker`)).toBe(true)
      } else if (mode !== 'cleanup-fail') expect(state.images).toEqual([])
    }
  } finally {
    clearTimeout(observer); clearInterval(cancel)
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8')) as State
    for (const pid of state.hungPids) { try { process.kill(pid, 'SIGKILL') } catch {} }
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}
// Windows local development remains supported. This suite executes the hosted
// Ubuntu Bash workflow and POSIX process groups, so only these eight transport
// controls are skipped on win32; portable unit tests and hosted proof stay active.
const posixIt = process.platform === 'win32' ? it.skip : it
for (const mode of ['success', 'build-fail', 'cleanup-fail', 'preexisting', 'hang-remove', 'hang-info', 'hang-inventory', 'cancel']) {
  posixIt(`executes the actual image workflow with bounded cleanup: ${mode}`, () => control(mode), 10_000)
}

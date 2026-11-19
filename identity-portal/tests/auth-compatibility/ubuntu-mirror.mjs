import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertHostedContext } from './contract.mjs'

const mirrorFile = '/etc/apt/apt-mirrors.txt'
const sourcesFile = '/etc/apt/sources.list.d/ubuntu.sources'
const archive = 'https://archive.ubuntu.com/ubuntu/\tpriority:2'
const security = 'https://security.ubuntu.com/ubuntu/\tpriority:3'
const regional = new Set([
  'http://azure.archive.ubuntu.com/ubuntu/\tpriority:1',
  'http://us-east-2.ec2.archive.ubuntu.com/ubuntu/\tpriority:1',
])
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

// The two HTTPS fallbacks already belong to the runner image. Drop only its
// known regional priority-1 entry; suites, keys and acquire policy are untouched.
export function canonicalUbuntuMirrors(text) {
  assert.ok(Buffer.byteLength(text) <= 4096, 'Unexpected hosted Ubuntu mirror list')
  const lines = text.split('\n').filter(Boolean)
  assert.ok(lines.length === 2 || lines.length === 3, 'Unexpected hosted Ubuntu mirror list')
  assert.equal(lines.filter(line => line === archive).length, 1, 'Require the existing canonical Ubuntu archive')
  assert.equal(lines.filter(line => line === security).length, 1, 'Require the existing Ubuntu security fallback')
  assert.ok(lines.every(line => line === archive || line === security || regional.has(line)), 'Unexpected hosted Ubuntu mirror list')
  assert.ok(lines.filter(line => regional.has(line)).length <= 1, 'Unexpected hosted Ubuntu mirror list')
  return text.split('\n').filter(line => !regional.has(line)).join('\n')
}

export function assertUbuntuMirrorContext(env, platform, arch, requestedHead, actualHead) {
  assert.equal(arch, 'x64', 'This transport correction is for the existing x64 hosted job')
  assert.equal(requestedHead, actualHead, 'Use the exact checked-out PR head')
  assertHostedContext({ ...env, AUTH_PROOF_HEAD: requestedHead }, platform, actualHead)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    assert.equal(args.length, 3)
    assert.equal(args[0], '--apply')
    assert.equal(args[1], '--head')
    const root = fileURLToPath(new URL('../../../', import.meta.url))
    const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    assertUbuntuMirrorContext(process.env, process.platform, process.arch, args[2], head)
    assert.equal(process.version, 'v24.22.1', 'Use the reviewed hosted Node runtime')
    const stat = fs.lstatSync(mirrorFile)
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 4096)
    const sources = fs.readFileSync(sourcesFile)
    assert.match(sources.toString(), /^URIs: mirror\+file:\/etc\/apt\/apt-mirrors\.txt\s*$/m)
    assert.match(sources.toString(), /^Suites: noble(?:\s|$)/m)
    const before = fs.readFileSync(mirrorFile)
    const after = Buffer.from(canonicalUbuntuMirrors(before.toString()))
    if (!before.equals(after)) execFileSync('sudo', ['-n', '/usr/bin/tee', mirrorFile], { input: after, stdio: ['pipe', 'ignore', 'pipe'] })
    assert.deepEqual(fs.readFileSync(mirrorFile), after)
    assert.deepEqual(fs.readFileSync(sourcesFile), sources, 'Preserve suites/components/signing configuration')
    console.log(JSON.stringify({ schema: 1, source: head, changed: !before.equals(after), beforeSha256: digest(before), afterSha256: digest(after), sourcesSha256: digest(sources), scope: 'Existing public Ubuntu mirror selection on this ephemeral hosted runner only' }))
  } catch {
    console.error('Canonical hosted Ubuntu mirror setup failed')
    process.exitCode = 1
  }
}

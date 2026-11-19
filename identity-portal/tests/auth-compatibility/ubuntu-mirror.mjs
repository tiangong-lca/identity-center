import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertHostedContext } from './contract.mjs'

const mirrorFile = '/etc/apt/apt-mirrors.txt'
const sourcesFile = '/etc/apt/sources.list.d/ubuntu.sources'
const archive = 'https://archive.ubuntu.com/ubuntu/\tpriority:2\n'
const security = 'https://security.ubuntu.com/ubuntu/\tpriority:3\n'
const observed = 'http://us-east-2.ec2.archive.ubuntu.com/ubuntu/\tpriority:1\n' + archive + security
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

// A transport correction for the exact observed profile, never a new prerequisite
// for a healthy or normally changed hosted image. Reasons contain no file text.
export function ubuntuMirrorPlan(mirrors, sources) {
  const noop = reason => ({ changed: false, reason })
  if (sources === null) return noop('deb822-source-not-present')
  if (Buffer.byteLength(sources) > 16384 || !/^URIs: mirror\+file:\/etc\/apt\/apt-mirrors\.txt\s*$/m.test(sources) || !/^Suites: noble(?:\s|$)/m.test(sources)) return noop('deb822-profile-not-observed')
  if (mirrors === null) return noop('mirror-list-not-present')
  if (mirrors === archive + security) return noop('canonical-https-already-preferred')
  if (mirrors !== observed) return noop('mirror-profile-not-observed-ec2')
  return { changed: true, reason: 'observed-ec2-regional-entry-removed', text: archive + security }
}

export function assertUbuntuMirrorContext(env, platform, arch, requestedHead, actualHead) {
  assert.equal(arch, 'x64', 'This transport correction is for the existing x64 hosted job')
  assert.equal(requestedHead, actualHead, 'Use the exact checked-out PR head')
  assertHostedContext({ ...env, AUTH_PROOF_HEAD: requestedHead }, platform, actualHead)
}

// IO is explicit for inert failure controls. Real write/read-back errors propagate.
export function writeAndVerifyUbuntuMirror(before, after, sources, io) {
  assert.equal(digest(io.readMirrors()), digest(before), 'Mirror list changed before write')
  io.writeMirrors(after)
  assert.equal(digest(io.readMirrors()), digest(after), 'Mirror list read-back failed')
  assert.equal(digest(io.readSources()), digest(sources), 'Preserve suites/components/signing configuration')
}

function readInitialFile(file, limit) {
  try {
    const stat = fs.lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) return null
    return fs.readFileSync(file)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  assert.equal(args.length, 3)
  assert.equal(args[0], '--apply')
  assert.equal(args[1], '--head')
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  assertUbuntuMirrorContext(process.env, process.platform, process.arch, args[2], head)
  assert.equal(process.version, 'v24.22.1', 'Use the reviewed hosted Node runtime')
  const sources = readInitialFile(sourcesFile, 16384)
  const before = readInitialFile(mirrorFile, 4096)
  const plan = ubuntuMirrorPlan(before?.toString() ?? null, sources?.toString() ?? null)
  if (plan.changed) {
    assert.ok(before && sources && plan.text)
    writeAndVerifyUbuntuMirror(before, Buffer.from(plan.text), sources, {
      readMirrors: () => fs.readFileSync(mirrorFile),
      readSources: () => fs.readFileSync(sourcesFile),
      writeMirrors: bytes => execFileSync('sudo', ['-n', '/usr/bin/tee', mirrorFile], { input: bytes, stdio: ['pipe', 'ignore', 'pipe'] }),
    })
  }
  console.log(JSON.stringify({ schema: 1, source: head, changed: plan.changed, reason: plan.reason, ...(before ? { beforeSha256: digest(before) } : {}), ...(sources ? { sourcesSha256: digest(sources) } : {}), ...(plan.changed ? { afterSha256: digest(plan.text) } : {}), scope: 'Observed public EC2 Ubuntu mirror selection on this ephemeral hosted runner only' }))
}

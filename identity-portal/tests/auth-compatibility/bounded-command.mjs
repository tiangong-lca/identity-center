// Hosted Linux/macOS test transport: bound the entire subprocess group, including
// descendants which ignore TERM. This command never activates a transport itself.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const [deadline, grace, command, ...args] = process.argv.slice(2)
assert.ok(Number(deadline) > 0 && Number(grace) > 0 && command)
assert.notEqual(process.platform, 'win32', 'Process groups require a POSIX host')
const child = spawn(command, args, { detached: true, stdio: 'inherit' })
let stopping = false
let childClosed = false
let stoppingCode
const signalGroup = signal => { try { process.kill(-child.pid, signal) } catch {} }
const joinKilledGroup = () => {
  const until = Date.now() + 1000
  const poll = () => {
    let absent = false
    try { process.kill(-child.pid, 0) } catch (error) { absent = error.code === 'ESRCH' }
    if (absent && childClosed) { process.exitCode = stoppingCode; return }
    if (Date.now() >= until) {
      console.error('Owned command group absence or child reaping unproved')
      process.exit(1)
    }
    setTimeout(poll, 10)
  }
  poll()
}
const stop = code => {
  if (stopping) return
  stopping = true
  stoppingCode = code
  clearTimeout(timer)
  signalGroup('SIGTERM')
  // Keep this timer even if the immediate child exits: descendants may survive it.
  setTimeout(() => {
    signalGroup('SIGKILL')
    // KILL queues termination. Keep our lifetime until the group is actually
    // absent and close has reaped the direct child, with a bounded 1s join.
    joinKilledGroup()
  }, Number(grace))
}
const timer = setTimeout(() => stop(124), Number(deadline))
process.on('SIGINT', () => stop(130))
process.on('SIGTERM', () => stop(143))
child.on('error', error => { console.error(error.message); clearTimeout(timer); process.exitCode = 127 })
child.on('close', (code, signal) => {
  childClosed = true
  if (stopping) return
  clearTimeout(timer)
  process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 143)
})

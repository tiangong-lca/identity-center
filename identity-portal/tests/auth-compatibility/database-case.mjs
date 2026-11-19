import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// A separate source experiment; historical framework/security cases stay exact.
export const databaseCase = 'database-2026-11-19'
export const databaseSource = Object.freeze({
  parent: '1ea85e1a8a369e2f2a2c7271cfa0a05cc6742f98',
  manifest: '5f59ecf21718901fa9f154b5626d6a3b755e03fbd60f2d5690475500be05b0c9',
  lock: '5e8a58eee52ff4a3ce153a8dfe82aa19c1ef7abf21ef615d71ac0a3972bf09ae',
})
export const databaseManifest = Object.freeze({
  dependencies: Object.freeze({ 'drizzle-orm': '^0.45.4', pg: '^8.23.1' }),
  devDependencies: Object.freeze({ 'drizzle-kit': '^0.31.11', '@types/pg': '^8.23.1' }),
})
export const databaseBaselineVersions = Object.freeze({
  'drizzle-orm': '0.45.2', 'drizzle-kit': '0.31.10', pg: '8.22.0', '@types/pg': '8.20.0',
  'pg-cloudflare': '1.4.0', 'pg-connection-string': '2.14.0', 'pg-protocol': '1.15.0', 'pg-pool': '3.14.0',
})
export const databaseVersions = Object.freeze({
  'drizzle-orm': '0.45.4', 'drizzle-kit': '0.31.11', pg: '8.23.1', '@types/pg': '8.23.1',
  'pg-cloudflare': '1.4.1', 'pg-connection-string': '2.14.1', 'pg-protocol': '1.16.1', 'pg-pool': '3.14.0',
})

export function installedDatabaseVersions(app) {
  const versions = {}
  for (const name of ['drizzle-orm', 'drizzle-kit', 'pg', '@types/pg']) versions[name] = JSON.parse(fs.readFileSync(path.join(app, 'node_modules', name, 'package.json'))).version
  const pgRequire = createRequire(fs.realpathSync(path.join(app, 'node_modules/pg/package.json')))
  for (const name of ['pg-cloudflare', 'pg-connection-string', 'pg-protocol', 'pg-pool']) {
    // Resolve the actual exported entry; newer pg packages hide package.json.
    let directory = path.dirname(pgRequire.resolve(name))
    let found = false
    for (let depth = 0; depth < 10; depth++) {
      const file = path.join(directory, 'package.json')
      if (fs.existsSync(file)) {
        const metadata = JSON.parse(fs.readFileSync(file))
        if (metadata.name === name) { versions[name] = metadata.version; found = true; break }
      }
      directory = path.dirname(directory)
    }
    assert.ok(found, `Require installed pg dependency metadata: ${name}`)
  }
  return versions
}

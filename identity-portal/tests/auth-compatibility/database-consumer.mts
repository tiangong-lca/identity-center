import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { asc, eq, is, getTableColumns } from 'drizzle-orm'
import { PgTable, pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core'
import { databaseCase, databaseSource } from './database-case.mjs'
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api'
import * as schemaExports from '@/db/schema'
import { createDbClient } from '@/lib/db/client'

const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const probeTable = pgTable('dependency_probe', {
  id: uuid('id').primaryKey(), keycloakSub: text('keycloak_sub').notNull(),
  email: text('email').notNull(), displayName: text('display_name'), metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
function canonical(value: unknown): unknown {
  if (value instanceof Date) return { type: 'Date', iso: value.toISOString() }
  if (Buffer.isBuffer(value)) return { type: 'Buffer', hex: value.toString('hex') }
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]))
  return value
}
function inputTree(root: string, directory: string) {
  const records: Array<{ path: string; sha256: string }> = []
  const walk = (relative: string) => {
    for (const name of fs.readdirSync(path.join(root, relative)).sort()) {
      const file = path.join(relative, name)
      const stat = fs.lstatSync(path.join(root, file))
      assert.equal(stat.isSymbolicLink(), false)
      if (stat.isDirectory()) walk(file)
      else { assert.ok(stat.isFile()); records.push({ path: file.split(path.sep).join('/'), sha256: digest(fs.readFileSync(path.join(root, file))) }) }
    }
  }
  walk(directory)
  return { files: records, sha256: digest(JSON.stringify(records)) }
}

/** Real source/API calls with socket connection denied. This never migrates a DB. */
export async function databaseConsumerProof(root = fileURLToPath(new URL('../../', import.meta.url)), mode: 'full' | 'focused' = 'full') {
  assert.ok(mode === 'full' || mode === 'focused')
  // Node's CJS export-star bridge and the Vitest ESM loader expose the same tables.
  const sourceSchema = () => {
    const exports = ('default' in schemaExports ? schemaExports.default : schemaExports) as Record<string, unknown>
    // Feed both compiler loaders the same ordered namespace; do not sort emitted SQL.
    return Object.fromEntries(Object.keys(exports).sort().map(name => [name, exports[name]]))
  }
  const schema = mode === 'full' ? sourceSchema() : null
  const table = mode === 'full' ? schema?.portalUsers : probeTable
  assert.ok(is(table, PgTable), 'Require the selected qualification table')
  const columns = getTableColumns(table)
  for (const name of ['id', 'keycloakSub', 'email', 'displayName', 'metadata', 'createdAt', 'updatedAt']) assert.ok(columns[name], `Require qualification column: ${name}`)
  const originalConnect = net.Socket.prototype.connect
  let networkConnectCalls = 0
  net.Socket.prototype.connect = function () { networkConnectCalls++; throw new Error('Database proof forbids a socket connection') }
  let client: ReturnType<typeof createDbClient> | undefined
  try {
    client = createDbClient('postgres://fixture:fixture@consumer.invalid:5444/identity-fixture')
    const id = '11111111-1111-4111-8111-111111111111'
    const instant = new Date('2026-01-02T03:04:05.000Z')
    const queries = {
      select: client.db.select({ id: columns.id, sub: columns.keycloakSub }).from(table).where(eq(columns.keycloakSub, "fixture'key")).orderBy(asc(columns.id)).limit(3).offset(2).toSQL(),
      insert: client.db.insert(table).values({ id, keycloakSub: 'fixture-sub', email: 'fixture@example.invalid', metadata: { locale: '中文', values: [null, 3] }, createdAt: instant, updatedAt: instant }).returning({ id: columns.id }).toSQL(),
      update: client.db.update(table).set({ displayName: '名字', metadata: { approved: true }, updatedAt: instant }).where(eq(columns.id, id)).returning({ id: columns.id }).toSQL(),
      delete: client.db.delete(table).where(eq(columns.id, id)).returning({ id: columns.id }).toSQL(),
    }
    const require = createRequire(path.join(root, 'package.json'))
    const pg = require('pg') as { escapeIdentifier: (value: string) => string; escapeLiteral: (value: string) => string; types: { getTypeParser: (oid: number) => (value: string) => unknown } }
    // This is the exact serializer called by pg's query path, not a replacement.
    const utils = require(path.join(root, 'node_modules/pg/lib/utils.js')) as { prepareValue: (value: unknown) => unknown }
    const driver = {
      identifier: pg.escapeIdentifier('fixture"name'), literal: pg.escapeLiteral("fixture'\\value"),
      parameters: [null, undefined, [1, null, 'a,b', 'a"b'], { locale: '中文' }, Buffer.from([0, 255]), { toPostgres: (prepare: (value: unknown) => unknown) => prepare(['custom', 'value']) }].map(value => utils.prepareValue(value)),
      bigint: pg.types.getTypeParser(20)('9223372036854775807'),
      json: pg.types.getTypeParser(3802)('{"locale":"中文","values":[1,null]}'),
    }
    assert.equal(client.pool.totalCount, 0)
    assert.equal(networkConnectCalls, 0)
    if (mode === 'focused') return canonical({ queries, driver, networkConnectCalls })
    assert.ok(schema)
    const empty = generateDrizzleJson({})
    const snapshot = generateDrizzleJson(schema, empty.id)
    const migrationSql = await generateMigration(empty, snapshot)
    const repeatedSql = await generateMigration(snapshot, snapshot)
    assert.deepEqual(repeatedSql, [])
    // Only generated snapshot linkage UUIDs are replaced; all schema/SQL survives.
    const stableSnapshot = { ...snapshot, id: '<generated-id>', prevId: '<previous-id>' }
    return canonical({ schemaInputs: inputTree(root, 'db/schema'), migrationInputs: inputTree(root, 'db/migrations'), tables: Object.keys(snapshot.tables).sort(), snapshot: stableSnapshot, migrationSql, repeatedSql, queries, driver, networkConnectCalls })
  } finally {
    try { await client?.close() } finally { net.Socket.prototype.connect = originalConnect }
  }
}

export function databaseConsumerSummary(value: unknown) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value))
  const proof = value as Record<string, unknown>
  return {
    schemaInputs: proof.schemaInputs, migrationInputs: proof.migrationInputs,
    tables: proof.tables, snapshotSha256: digest(JSON.stringify(proof.snapshot)),
    migrationSqlSha256: digest(JSON.stringify(proof.migrationSql)),
    repeatedSql: proof.repeatedSql, queries: proof.queries, driver: proof.driver,
    networkConnectCalls: proof.networkConnectCalls,
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const selected = process.argv[2]
  const verify = selected === '--verify-case'
  const focused = selected === '--focused'
  const output = verify || focused ? process.argv[3] : selected
  assert.equal(process.argv.length, verify || focused ? 4 : 3)
  assert.ok(output && path.isAbsolute(output))
  const proof = await databaseConsumerProof(undefined, focused ? 'focused' : 'full')
  let receipt: unknown = proof
  if (verify) {
    const fixtureBytes = fs.readFileSync(fileURLToPath(new URL('./fixtures/database-consumers.json', import.meta.url)))
    assert.equal(digest(fixtureBytes), databaseSource.consumers, 'Keep the immutable dependency-case database oracle')
    const fixture = JSON.parse(fixtureBytes.toString())
    assert.equal(fixture.source, databaseSource.parent)
    const summary = databaseConsumerSummary(proof)
    assert.deepEqual(summary, fixture.summary, 'Exact dependency-case schema/migration/SQL/client comparison')
    receipt = { schema: 1, qualificationCase: databaseCase, oracleSource: fixture.source, matched: true, summary, fullProofSha256: digest(JSON.stringify(proof)) }
  }
  fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' })
}

import { expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { databaseCase, databaseSource, databaseBaselineVersions, databaseVersions, installedDatabaseVersions } from '../auth-compatibility/database-case.mjs'
import { databaseConsumerProof, databaseConsumerSummary } from '../auth-compatibility/database-consumer.mjs'
import { assertQualificationManifest, assertQualificationVersions } from '../auth-compatibility/qualification-case.mjs'
import { securityInputsForCase, eslintConfigCase } from '../auth-compatibility/framework-patch.mjs'

const app = path.resolve(__dirname, '../..')
const fixture = JSON.parse(fs.readFileSync(path.join(app, 'tests/auth-compatibility/fixtures/database-consumers.json'), 'utf8'))
const immutable = JSON.parse(fs.readFileSync(path.join(app, 'tests/auth-compatibility/fixtures/manifest-security-audit.json'), 'utf8'))
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex')

it('preserves actual schema/migration inputs, Kit SQL, thin-adapter queries and pg serialization without connecting', async () => {
  expect(fixture.source).toBe('1ea85e1a8a369e2f2a2c7271cfa0a05cc6742f98')
  const summary = databaseConsumerSummary(await databaseConsumerProof(app))
  expect(summary).toEqual(fixture.summary)
  expect(summary.networkConnectCalls).toBe(0)
  expect(summary.repeatedSql).toEqual([])
})

it('binds only the new database manifest/lock while keeping all historical security inputs exact', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8'))
  expect(() => assertQualificationManifest(databaseCase, immutable.content, manifest)).not.toThrow()
  expect(() => assertQualificationManifest(eslintConfigCase, immutable.content, manifest)).toThrow()
  const stale = structuredClone(manifest)
  stale.dependencies.pg = '^8.22.0'
  expect(() => assertQualificationManifest(databaseCase, immutable.content, stale)).toThrow()
  const retained = fs.readFileSync(path.join(app, 'tests/auth-compatibility/security-inputs.json'))
  const historic = securityInputsForCase('security-audit', retained)
  const current = securityInputsForCase(databaseCase, retained)
  expect(databaseSource.parent).toBe(fixture.source)
  for (const [file, digest] of Object.entries(current.candidateHashes)) {
    if (file === 'identity-portal/package.json' || file === 'identity-portal/pnpm-lock.yaml') {
      expect(digest).toBe(hash(fs.readFileSync(path.join(app, '..', file))))
    } else expect(digest).toBe(historic.candidateHashes[file])
  }
})

it('requires every actual database/pg closure version and keeps baseline versions distinct', () => {
  const names = ['next', 'react', 'react-dom', '@types/react', '@types/react-dom', 'jose', '@keycloak/keycloak-admin-client', 'monaco-editor', 'monaco-yaml', 'shadcn', 'zod', 'vitest', '@vitest/coverage-v8', 'eslint-config-next']
  const versions: Record<string, string> = Object.fromEntries(names.map(name => [name, JSON.parse(fs.readFileSync(path.join(app, 'node_modules', name, 'package.json'), 'utf8')).version]))
  const config = fs.realpathSync(path.join(app, 'node_modules/eslint-config-next/package.json'))
  versions['@next/eslint-plugin-next'] = JSON.parse(fs.readFileSync(createRequire(config).resolve('@next/eslint-plugin-next/package.json'), 'utf8')).version
  Object.assign(versions, installedDatabaseVersions(app))
  expect(installedDatabaseVersions(app)).toEqual(databaseVersions)
  expect(() => assertQualificationVersions(databaseCase, 'candidate', versions)).not.toThrow()
  for (const name of Object.keys(databaseVersions)) {
    expect(() => assertQualificationVersions(databaseCase, 'candidate', { ...versions, [name]: '0.0.0' }), name).toThrow()
  }
  const baseline = { ...versions, ...databaseBaselineVersions, next: '16.4.2', 'eslint-config-next': '16.4.2', '@next/eslint-plugin-next': '16.4.2', shadcn: '4.21.0', zod: '4.4.3', vitest: '4.1.11', '@vitest/coverage-v8': '4.1.11' }
  expect(() => assertQualificationVersions(databaseCase, 'baseline', baseline)).not.toThrow()
  expect(() => assertQualificationVersions(databaseCase, 'candidate', baseline)).toThrow()
})

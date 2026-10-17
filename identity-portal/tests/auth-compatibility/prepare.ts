import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import KcAdminClient from '@keycloak/keycloak-admin-client'
import { createDbClient } from '../../lib/db/client'
import { seedAdminRbac } from '../../scripts/seed/admin-rbac'
import { seedKeycloakAdmin, seedAdminConfigFromEnv } from '../../scripts/seed/keycloak-admin'
import { fixture } from './fixture'

async function main() {
  const c = fixture()
  const master = new KcAdminClient({ baseUrl: c.keycloakOrigin, realmName: 'master' })
  await master.auth({ username: 'identityproof', password: c.masterPassword, grantType: 'password', clientId: 'admin-cli' })
  master.setConfig({ realmName: c.realm })
  const secret = async (clientId: string) => {
    const clients = await master.clients.find({ clientId })
    assert.equal(clients.length, 1)
    assert.ok(clients[0].id)
    const { value } = await master.clients.getClientSecret({ id: clients[0].id })
    assert.ok(value)
    return value
  }
  c.portalSecret = await secret('user-portal')
  c.adminApiSecret = await secret('user-portal-admin-api')
  const db = createDbClient(process.env.DATABASE_URL!)
  try {
    await seedAdminRbac(db.db)
    const seeded = await seedKeycloakAdmin(db.db, seedAdminConfigFromEnv())
    c.userId = seeded.keycloakSub
    // This disposable proof user is not a first-login/password-policy qualification.
    await master.users.resetPassword({ id: c.userId, credential: { type: 'password', value: c.userPassword, temporary: false } })
  } finally { await db.close() }
  writeFileSync(process.env.AUTH_PROOF_CONFIG!, JSON.stringify(c), { mode: 0o600 })
  console.log('Owned local OIDC fixture prepared; credentials remain private')
}

main().catch(() => { console.error('Owned fixture preparation failed'); process.exitCode = 1 })

// lib/catalog/diff.ts
import type { CatalogApp, CatalogRole } from './schema'

export type CatalogDiff = {
  created: string[]
  updated: string[]
  unchanged: string[]
  pendingDeactivate: string[]
  roles: { created: string[]; updated: string[]; pendingDeactivate: string[] }
}

function appEqual(a: CatalogApp, b: CatalogApp): boolean {
  return (
    a.name === b.name &&
    a.status === b.status &&
    a.keycloak.clientId === b.keycloak.clientId &&
    a.keycloak.accessRole === b.keycloak.accessRole &&
    (a.webhook?.url ?? null) === (b.webhook?.url ?? null) &&
    (a.webhook?.secretRef ?? null) === (b.webhook?.secretRef ?? null) &&
    (a.loginUrl ?? null) === (b.loginUrl ?? null) &&
    (a.adminUrl ?? null) === (b.adminUrl ?? null)
  )
}

function roleEqual(a: CatalogRole, b: CatalogRole): boolean {
  return a.name === b.name && (a.description ?? null) === (b.description ?? null)
}

export function computeCatalogDiff(current: CatalogApp[], desired: CatalogApp[]): CatalogDiff {
  const diff: CatalogDiff = {
    created: [],
    updated: [],
    unchanged: [],
    pendingDeactivate: [],
    roles: { created: [], updated: [], pendingDeactivate: [] },
  }
  const curByCode = new Map(current.map((a) => [a.code, a]))
  const desiredByCode = new Map(desired.map((a) => [a.code, a]))

  for (const d of desired) {
    const c = curByCode.get(d.code)
    if (!c) diff.created.push(d.code)
    else if (!appEqual(c, d)) diff.updated.push(d.code)
    else diff.unchanged.push(d.code)

    const curRoles = new Map((c?.roles ?? []).map((r) => [r.code, r]))
    const desiredRoles = new Map(d.roles.map((r) => [r.code, r]))
    for (const dr of d.roles) {
      const cr = curRoles.get(dr.code)
      if (!cr) diff.roles.created.push(`${d.code}/${dr.code}`)
      else if (!roleEqual(cr, dr)) diff.roles.updated.push(`${d.code}/${dr.code}`)
    }
    for (const cr of c?.roles ?? []) {
      if (!desiredRoles.has(cr.code)) diff.roles.pendingDeactivate.push(`${d.code}/${cr.code}`)
    }
  }
  for (const c of current) {
    if (!desiredByCode.has(c.code)) diff.pendingDeactivate.push(c.code)
  }
  return diff
}

export function hasChanges(diff: CatalogDiff): boolean {
  return (
    diff.created.length > 0 ||
    diff.updated.length > 0 ||
    diff.pendingDeactivate.length > 0 ||
    diff.roles.created.length > 0 ||
    diff.roles.updated.length > 0 ||
    diff.roles.pendingDeactivate.length > 0
  )
}

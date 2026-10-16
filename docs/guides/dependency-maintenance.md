---
docType: maintenance-guide
scope: repo
status: active
authoritative: false
owner: identity-center
language: en
whenToUse: Review npm/Actions monitoring or its hosted activation; assess remaining Docker image qualification.
whenToUpdate: Monitoring scope, cadence, limits, package-manager compatibility, validation or image prerequisites change.
checkPaths:
  - .github/dependabot.yml
  - identity-portal/pnpm-lock.yaml
  - docs/guides/dependency-maintenance.md
lastReviewedAt: 2026-10-16
lastReviewedCommit: cdfa62c942d929ab84dbd5d3a27ce43380495732
lastReviewedNote: "Reviewed the Identity #25 candidate against the current Main base; this is source/portal validation, not Docker-image, deployment or production identity qualification."
---

# Dependency maintenance

`.github/dependabot.yml` monitors the owned `identity-portal` npm graph and
GitHub Actions. It owns weekly staggered Shanghai schedules, seven-day cooldowns,
limits of two npm PRs and one Actions PR, and related minor/patch groups. Major
updates stay individually visible; there is no auto-merge. Prototype assets are
outside the npm directory. No exclusion is needed; any future `exclude-paths`
entry must be repository-relative without a leading slash.

Preserve Node22 CI and the exact pnpm11.9 package-manager declaration/integrity,
frozen lockfile, workspace build approvals and current runtime pins. The existing
`next-auth` beta.32 approval in D-006 is a single exception: monitoring does not
authorize another prerelease or weaken SSO/auth/admission/event-sync contracts.
Manifest and source changes retain existing stricter Docpact rules. A lock-only
maintenance change reviews this guide; it must still pass the real frozen install.

## Existing validation

The existing `quality` job already runs on PRs and Main pushes: frozen install,
ESLint boundaries, typecheck and all unit tests. It stays secretless with a
read-only token, exact PR-head checkout, no persisted credentials and cancellation
of superseded quality runs. Bot identity is not the gate; manually authored or
maintainer-edited dependency PRs receive the same checks. No new job or check is
added to unrelated feature work.

For a dependency PR, run the existing commands from `identity-portal/`:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The build additionally checks Next compilation and standalone output; it does
not prove deployed startup, a container image, OIDC transport or production
identity behavior. Auth/Keycloak, database-driver and MQ runtime updates also
need the owner's applicable existing real integration proof against disposable
dependencies before acceptance; unit/build success alone does not qualify SSO,
admission or event-sync transport. Existing unit negatives include missing/malformed env,
unauthenticated Redis URLs, forbidden layer imports and realm registration/email
policy. Never give a bot deployment credentials to satisfy a dependency gate.

After reviewed Main source delivery, require successful hosted npm and Actions
scans and relevant PR quality checks before claiming monitoring works. GitHub's
published support table currently lists pnpm through v10, while the upstream
updater implementation handles newer pinned pnpm versions; source/local success
is not proof of hosted pnpm11.9 support. Keep that exact manager pin and record
any real hosted failure as its own prerequisite rather than downgrading it.
Security-alert/security-update settings are separate from version-monitoring
cadence and must be verified independently.

## Docker and Compose prerequisite

Docker/Compose monitoring is **not enabled** by this change. The owner is
`identity-center`; [Identity #26](https://github.com/tiangong-lca/identity-center/issues/26)
owns the executable image-qualification prerequisite. It is Ready and has not
started; no image coverage or activation is claimed. The source Dockerfile
contains Node22 Alpine portal/worker targets; Compose
selects PostgreSQL17, Keycloak26.5, Redis7 and RabbitMQ4, with dev Mailpit and
optional KES. Their tags, manifests and production env inputs remain unchanged.

`tests/unit/realm-config.test.ts` validates generated representation only. The
existing real `keycloak-bootstrap`, `keycloak-admin`, migrations/repositories,
`rate-limit` and `mq-adapter` integration suites need running dependencies. Dev
Compose fixes project names, ports and persistent volumes; production Compose
requires operational secrets. Running either against shared/default resources
is not an isolated image-upgrade gate.

Before enabling image monitoring, the tracked prerequisite must prove:

- Unique disposable project/ports/containers/volumes/network and synthetic
  credentials, no shared or production identity access; cleanup receipts on
  success, failure and cancellation.
- Actual baseline and candidate images/digests/platform startup, both portal and
  worker builds for a Node-image change, and checks scoped to relevant inputs.
- Real temporary-realm OIDC/PKCE and missing-PKCE rejection, admin disable/logout,
  client-role grant/revoke and dependency-outage rejection; fresh Postgres
  migrations/repositories; authenticated Redis plus wrong-password denial;
  RabbitMQ publish/ack/nack. Test the changed service rather than infer coverage.
- Explicit separate Mailpit/SMTP and D-001 KES dispositions, a deliberately bad
  image/readiness failure, and first hosted scan/runtime-check evidence before
  activation. No deployment or production identity operation is authorized.

The npm/Actions source work in #25 is not whole-image qualification. Its Docker
scope is tracked separately in [#26](https://github.com/tiangong-lca/identity-center/issues/26)
and remains unqualified until that task delivers the required evidence.

References: [GitHub options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference),
[ecosystem support](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories),
[updater pnpm selection](https://github.com/dependabot/dependabot-core/blob/main/npm_and_yarn/lib/dependabot/npm_and_yarn/helpers.rb).

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
lastReviewedAt: 2026-11-19
lastReviewedCommit: 969508cc2355f25b8852190918c3b13f81a81e21
lastReviewedNote: "Identity #58 reviewed the scoped database graph and immutable dependency qualification, including the correction that confines whole schema/migration equality to its explicit case. Ordinary quality uses an owned probe; product/design/DB semantics, original auth/image gates and retained #49/#51/#52 scope stay unchanged."
---

# Dependency maintenance

`.github/dependabot.yml` monitors the owned `identity-portal` npm graph and
GitHub Actions. It owns weekly staggered Shanghai schedules, seven-day cooldowns,
limits of two npm PRs and one Actions PR, and related minor/patch groups. Major
updates stay individually visible; there is no auto-merge. Prototype assets are
outside the npm directory. No path exclusion is needed; any future `exclude-paths`
entry must be repository-relative without a leading slash.

The npm entry ignores only `@types/node` versions `>=25.0.0`, keeping types24
aligned with the reviewed Node24 LTS baseline. Identity #41 migrates the runtime
to Node24.22.1 and the manifest to `@types/node: ^24.19.2`; `.nvmrc`, both CI
workflows and Portal/Worker Docker stages select that runtime. Lifting the ceiling
needs explicit approval of another major runtime/types baseline and compatibility
qualification. Other packages and Actions continue ordinary Dependabot proposals,
including individually visible majors.

Preserve the exact pnpm11.9 package-manager declaration/integrity, frozen lockfile,
workspace build approvals and Node24 track. The existing
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

The bounded [2026-10-17 Next qualification](../references/2026-07-02-l0-dependency-versions.md#2026-10-17-next-1642-source-security-qualification)
records the selected framework/lint versions, preserved compatibility pins and
local source-only evidence for Identity #32 / original PR #31. It does not
replace fresh hosted CI, independent review or required workspace integration.

## Bounded auth-client interoperability proof (Identity #34)

The separate `auth-compatibility.yml` PR workflow is scoped to dependency and
its own test inputs. It preserves the existing `ci.yml` quality job and uses an
exact-head checkout, read-only permissions and pinned verified action commits.
Node24.22.1 and the exact pnpm11.9 manifest declaration remain the application tools.
No production secret, deployment environment, external IdP or main-push operation
is part of this job.

The [test harness](../../identity-portal/tests/auth-compatibility/README.md)
compares accepted baseline `d9b4827c961967fe16ef31c365025049c7ff8802` with the
composed candidate. It uses the same recorded immutable PostgreSQL17,
Keycloak26.5 and authenticated Redis7 images, with independent synthetic realms,
project names, ports, networks and storage. Existing admin/PKCE tests are followed
by actual standalone Auth.js browser login, real signed backchannel/JWKS/Redis
revocation and pre-existing-session denial. Controlled JWT/JWKS/Redis negatives
are separate from that real provider flow. Process, Docker and inventory cleanup
are all attempted even if another cleanup action fails; only sanitized receipts
are retained. A deliberately unhealthy fixture checks failure cleanup.

The local orchestrator refuses Docker activation. Local daemon sockets are absent;
starting an engine could restart unobserved resources. Local unit/build success
therefore does not claim the hosted protocol proof has run. First exact-head
hosted execution, independent review and source/integration delivery remain
required. The proof is npm-client interoperability, not completion of Identity #26.

SID-only logout remains a recorded baseline limit: the handler writes a SID marker
but session polling checks subject markers. The harness observes both versions
without claiming that path is fixed or library-caused. Real Keycloak token shape
must establish the covered logout scenario, and any remaining limit needs explicit
owner disposition. No product behavior or realm policy is changed for the test.

The [dated dependency record](../references/2026-07-02-l0-dependency-versions.md#2026-10-17-auth-client-source-and-harness-qualification)
records selected artifacts, graph preservation and the distinction between local
checks and pending hosted interoperability evidence.

## Docker and Compose prerequisite

Docker/Compose monitoring is **not enabled** by this change. The owner is
`identity-center`; [Identity #26](https://github.com/tiangong-lca/identity-center/issues/26)
owns the executable image-qualification prerequisite. It is Ready and has not
started; no image coverage or activation is claimed. The source Dockerfile
contains Node24.22.1 Alpine portal/worker targets; Compose
selects PostgreSQL17, Keycloak26.5, Redis7 and RabbitMQ4, with dev Mailpit and
optional KES. Their service tags and production env inputs remain unchanged. The Node image
source change is tracked under #41 and still needs isolated image-build proof;
it does not activate Docker monitoring or authorize deployment.

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

## Separate renderer qualification (Identity #44)

The React case in the existing auth compatibility workflow is now explicitly
selected against immutable Main64055a2. Its manifest boundary admits only the
exact React/DOM19.3.1 pair; the frozen graph updates types19.3.0 and scheduler0.28.0
with required peer substitutions. Existing `^19` type declarations and every
other direct dependency/tool/runtime/product pin remain. Whole-lock comparison
must account for every changed snapshot, including rejecting incidental refreshes.
The old historical auth-client case retains its19.2.4 assertions and is not claimed
to execute on this19.3 candidate. Actual standalone UI checks augment the same
synthetic hosted auth flow; local/static validation does not replace them.

Original PR29 also proposed many incidental transitive updates. The scoped React
change does not implicitly deliver or retire those records: the coordinating
owner must preserve a complete per-record contained/superseded/gap disposition
and any required follow-up. Original29 remains closed unmerged.

## Identity48 security follow-up

The separate [security qualification](../references/2026-10-28-dependency-security.md) records the exact Main68 baseline, compatible graph, required all-copy sanitizer patch and pending full qualification. No zero-vulnerability claim or legacy-esbuild waiver is made.

Identity48 correction restores only the independently reviewed satisfied-range graph drift and adds mandatory source-bound behavioral fixture receipts. Actual DOM/browser and application-format security proof remain gated; Both public CommonJS and rooted Node ESM controls are now required; actual Next application proof remains pending. See the security qualification record for current limitations.

## Next.js 16.4.6 qualification for Identity #55

The original Next.js 16.4.5 proposal stopped during the 24-hour frozen-install
age check on two newly published transitive packages. The original lock
installed successfully after the cutoff elapsed. The next unit stage then
rejected its manifest against the prior image source hash. Keep both observations
when evaluating the original PR.

The focused 16.4.6 update is resolved from the accepted Main graph. Only Next,
its environment package and eight native SWC packages move. The unchanged
compatibility pins include React, next-auth, Keycloak, the ESLint configuration
and the Monaco patch. The earlier `security-audit` case retains its immutable
baseline and expectations. The `next-16.4.6` case binds the new input
bytes and uses that same behavioral suite. The former Next.js advisories clear
on a fresh audit, while the separately recorded #49 and #52 residuals retain
their existing owners. See the [source and image proof contract](../../identity-portal/tests/auth-compatibility/README.md).

## ESLint configuration for Identity #57

The `eslint-config-next-16.4.6` case adds the development configuration and
its `@next/eslint-plugin-next` dependency to the framework graph accepted in
#55. Both resolve to 16.4.6. The case pins the manifest and frozen lock and
checks both installed versions when running the existing compatibility suite.
The earlier source cases retain their own graph and manifest expectations.

## Database cohort for Identity #58

Original PR40 adopts the four latest compatible stable database declarations:
Drizzle ORM0.45.4, Kit0.31.11 and pg/@types8.23.1. Current official release
metadata is outside the configured age windows. The scoped lock restores the
original proposal's unrelated Rolldown/OXC/wasm/PostCSS/resolver/lint/helper
changes, preserving #51's remaining accounting. Seven package records and eight
snapshots/peer bindings move; the other 950 entries in each map remain exact.
Official metadata and full archive SRI checks bind all seven selected artifacts.

The new `database-2026-11-19` source case composes with accepted Main1ea85e1,
keeps every prior source/hash case and requires the actual installed database
closure. Actual root-frozen Main/candidate Kit API and CLI, thin-adapter query
compilation and pg serialization compare offline without opening a connection.
This does not implement #49's obsolete-loader removal, apply a migration or
claim PostgreSQL/KES server equivalence. The five current unfiltered audit
findings (one High, three Moderate and one Low) match current Main exactly and
remain with #49/#52; #51's89-record scope is not retired. See the
[qualification contract](../../identity-portal/tests/auth-compatibility/README.md).
The full existing hosted image and both-variant auth/UI/security gate remains
required before original-source delivery and exact workspace integration.

The complete historical schema/migration/SQL oracle is required only by the
explicit database dependency case's `database-consumer.mts --verify-case`
entry in both archived variants. Ordinary quality uses an owned probe table and
pg conversions, allowing independent business schema/migration changes without
rewriting the historical oracle. All prior auth/image/behavior checks remain.

## Bounded hosted Ubuntu transport prerequisite — Identity #58

Two exact-source Auth attempts passed native image inspection and the immutable
baseline database case, then exhausted the unchanged browser-install command
budget while the preferred EC2 Ubuntu mirror downloaded32.1MB in5m43s and6m21s.
The candidate variant did not execute and neither failure is accepted coverage.
Both attempts retain successful real fixture/image cleanup receipts.

The [official runner construction](https://github.com/actions/runner-images/blob/main/images/ubuntu/scripts/build/configure-apt-sources.sh)
uses a public regional priority1 mirror and already configured HTTPS Ubuntu
archive/security fallbacks at priorities2/3. The
[APT mirror contract](https://manpages.ubuntu.com/manpages/noble/man1/apt-transport-mirror.1.html)
selects lower priorities first. The hosted-only helper removes only the known
Azure/EC2 regional entry from that existing mirror list. It retains both HTTPS
fallbacks and their metadata, and verifies the deb822 source file remains
byte-identical, preserving suites/components/signing policy. Unknown mirror
formats fail before modification. Exact repository/head, native Linux x64,
GitHub-hosted and Node24.22.1 guards precede any configuration access.

This step does not run apt itself, alter packages/versions, signing keys, acquire
settings, caches, test selection, timeout/retry values or production hosts.
The original Playwright installation and every image/auth/UI/security check
remain mandatory under the original bounds. Only the ephemeral runner mirror
file changes; a source-bound hash-only receipt is uploaded through the existing
always-run artifact step. Local owned-fixture tests do not claim hosted recovery;
a fresh reviewed exact-head full workflow must prove it.

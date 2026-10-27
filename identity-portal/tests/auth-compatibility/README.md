# Auth dependency interoperability proof

Identity #34 qualifies Keycloak admin26.8.1 and jose6.2.12 against accepted
Main `d9b4827c961967fe16ef31c365025049c7ff8802`. This is test support; application
behavior, server version lines, production Compose and existing quality CI stay
unchanged by #34. Identity #41 moves both fixture executions to Node24.22.1,
updates the expected types24 manifest and admits only the exact reviewed Node24
Dockerfile and runbook environment-row deltas. The Docker dependency stage also
copies the existing pnpm workspace build approvals. Other executable product or
deployment changes still fail closed; unit negatives protect these boundaries.
Fresh exact-head hosted proof and independent review remain required.

`.github/workflows/auth-compatibility.yml` runs only for related PR inputs,
checks out the exact head and uses a read-only token. The Node orchestrator refuses
local/self-hosted execution before Docker access. **Do not start a local Docker
daemon to run this proof.** Existing local resources cannot be inventoried while
its sockets are absent and may restart when the engine starts.

The job pulls the owner's PostgreSQL17, Keycloak26.5 and Redis7 version lines,
records native Linux x64 digests, then uses those same immutable images for a
controlled readiness failure and separate baseline/candidate runs. Every run owns
unique project/realm/ports/network/storage and synthetic credentials. No real user,
external IdP, SMTP, MQ, KES, shared realm or production credential is involved.
This is client interoperability, not whole-image qualification under Identity #26.

Each actual run installs its exact frozen graph, bootstraps an owned realm,
creates/migrates a separate Portal database and prepares a synthetic user using
existing owner seed helpers. It runs existing admin/PKCE integration suites,
builds standalone Next, verifies its owned listener, and performs a real browser
OIDC/PKCE login. A bounded local relay records only token shape and response
status while forwarding Keycloak's real signed backchannel logout to the actual
handler. The pre-existing Auth.js session and protected endpoint must then deny
access, with a matching real authenticated-Redis revocation marker.

Separate controlled JWKS/JWT cases exercise the actual handler and crypto,
including invalid issuer/audience/algorithm/signature/age/events/nonce, malformed
input/JWKS, cooldown/key rotation, wrong Redis password and stopped owned Redis.
These synthetic controls do not replace the actual Keycloak/browser flow.

SID-only revocation is a **known baseline limitation**: the route writes a SID
marker while session polling checks subject markers. The proof records its actual
result for both runtimes without asserting that session denial works or fixing
product behavior. Real Keycloak token shape determines the covered logout flow.
The comparison receipt carries the limitation for explicit owner disposition;
a green job alone is not a full SID-only contract claim.

Process termination, Docker removal and inventories are attempted independently;
cleanup errors are aggregated after all attempts. Partial startup, failure and
cancellation retain honest receipts. No global prune is used. A successful run
requires no owned containers, volumes or networks remaining. Hard-killed runner
disposal is not reported as a successful explicit cleanup receipt.

Only sanitized logs, input/runtime bindings, safe protocol projections and cleanup
receipts are uploaded. Credentials, cookies, raw JWTs, dotenv files and browser
state stay private and are removed with task directories. Browser tracing and
screenshots are disabled for this credential-bearing synthetic flow.

Local unit tests cover target/ownership validation, three-service rendering,
environment isolation, cleanup failure paths, chunk-safe redaction, exact-head
secretless workflow scope, and real local-invocation refusal with a fake Docker
transport that must never run. They do not execute Docker or establish runtime
interoperability. Normal local install/lint/typecheck/unit/standalone-build gates
remain required; the hosted protocol proof follows review and main's normal push.

## Separate React 19.3 experiment (Identity #44)

The PR workflow explicitly selects `AUTH_PROOF_CASE=react19.3`. Its immutable
baseline is Main `64055a2cd05fa4056ea36fd9ab1b780a77e1690e`; candidate source must
be the requested exact descendant head. The baseline manifest hash is fixed, and
the candidate manifest may change only React/DOM19.2.4 to the exact19.3.1 pair.
Installed baseline types19.2.17/19.2.3 and candidate types19.3.0/19.3.0 are asserted.
Next16.4.2, accepted auth clients and Node24 remain fixed on both sides. Product,
image, runtime/configuration changes fail this case; documentation may change
review metadata only within protected product paths.

The original default `auth-client` experiment remains bound to its historical
baseline and both19.2.4 renderers. It intentionally rejects a19.3 candidate; the
new workflow selection does not claim that historical experiment ran against the
new renderer. Both cases retain the same actual auth and transport negatives,
hosted-only execution guard, privacy/cleanup and recorded SID-only limitation.

The React case additionally exercises the actual standalone Portal before logout:
first render plus interactive locale/theme hydration, same-document Link
navigation (a browser-memory sentinel must survive), a real synthetic organization
form with server readback, Radix dialog focus trapping/Escape restoration, and
Monaco typing with an actual no-op catalog apply request/response. Both zh/en and
light/dark transitions are asserted after navigation. No route or backend API is
mocked; writes are limited to the unique disposable synthetic database. The UI
receipt retains error counts only; a separate bounded structural error receipt
is described below. Neither retains raw error/console prose, URLs or browser state.
This support remains unqualified until both hosted source variants actually pass.

`node tests/auth-compatibility/run.mjs --validate-sources` performs only clean
Git-source/baseline/manifest/product validation and exits before any Docker or
service access. Set `AUTH_PROOF_CASE` and `AUTH_PROOF_HEAD` explicitly. It grants
no hosted/runtime qualification. The no-argument runtime entrypoint still refuses
local/self-hosted execution before Docker. An actual entrypoint regression uses
positively verified inert command doubles and rejects wrong source/case,
manifest and product deltas; pure helper tests alone cannot prove that wiring.

The React source fence enumerates the entire tracked Git delta with NUL-separated
paths. It admits only the exact manifest/lock, this qualification support and its
specific workflow/unit test, two qualification records, and enumerated governance
documents. Governance files permit only `lastReviewedAt`, `lastReviewedCommit` and
`lastReviewedNote` changes, preserving other frontmatter, routing rules and prose.
Every unrecognized path fails closed, including executable YAML, database config
and newly introduced product directories. The historical auth-client experiment
retains its original product-path fence. Actual entrypoint negatives cover
`config/business-apps.yaml`, `drizzle.config.ts` and a new product path; a pure
path-policy unit test also protects metadata/body boundaries.

The exhaustive React scan uses `--no-renames`: a product file moved unchanged
into an allowed support directory must expose both the deleted source and added
destination. The entrypoint regression owns a real temporary Git repository,
asserts its default `R100` destination-only projection, then forwards the actual
entrypoint diff flags to Git. An old-projection exposure control passes while the
normal rename-disabled path rejects the product deletion. This protects the
command wiring as well as the pure path classifier; it creates no product rename.

The registry navigation selector uses the unique navigation-role link named
“Registry”, then checks its exact destination and same-document sentinel. The
shipped apps page also has an “Edit in registry” CTA with the same href, so href
uniqueness is not a valid assertion. The first hosted baseline's strict-mode
failure is retained as evidence of that test defect; no product or renderer
failure is inferred and no unexecuted candidate/auth result is claimed.

Monaco interaction targets its unique visible `role="code"` editor root and
checks contained DOM focus after a normal click. Modern Chromium's native
EditContext textbox can be hidden behind that view; asserting textbox visibility
misstates the shipped input behavior. Keyboard editing and exact apply payload,
version and server-readback checks remain mandatory. No internal model mutation,
forced hidden-element action, browser-option override or timeout inflation is used.


## Bounded structural page-error diagnostics

`browser-errors.json` preserves only a fixed observation-stage enum, allowlisted
error name, fixed known message category/allowlisted React code, and at most three
locations from the exact owned build's emitted `/_next/static/*.js` inventory.
Locations contain only the recognized public asset path and bounded line/column;
raw URLs, queries, userinfo, function names, error messages and stack prose are
discarded. Unknown values become fixed categories. Existing fixture-secret/JWT/
header redaction runs before classification. Opaque, short or encoded values that
are not recognized structural fields never enter a receipt. The fingerprint is
computed only from that safe projection, never from raw secret-dependent text.

At most eight samples and8KiB total JSON are retained, with total/overflow counts;
caps never suppress error counters. Projection failures produce a fixed fallback.
Stages identify when an error was observed, not its cause. Console observation
remains type/count only. The strict zero-page/console-error assertion is unchanged.
Observers are removed in `finally`, and a failed UI still preserves diagnostics
while retaining its failure and Redis cleanup. No trace, screenshot, video, saved
browser state, raw error dump, ignored error or product fix is introduced.

Offline controls exercise emitted-asset ownership, forged URLs, fixture/encoded/
short/opaque secrets, JWT/JWE, headers, custom names/function names, safe-equivalent
fingerprints, throwing getters, invalid coordinates/stages and size overflow.
These controls do not establish the actual hosted error cause or compatibility;
fresh hosted evidence remains required.

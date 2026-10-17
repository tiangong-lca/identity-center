# Auth dependency interoperability proof

Identity #34 qualifies Keycloak admin26.8.1 and jose6.2.12 against accepted
Main `d9b4827c961967fe16ef31c365025049c7ff8802`. This is test support; application
behavior, server version lines, production Compose and existing quality CI stay
unchanged. The first hosted run and independent review are pending.

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

# Catalog YAML worker compatibility — Identity46

The frozen Main64055a2 graph uses monaco-editor0.55.1, monaco-yaml5.5.1 and
monaco-worker-manager2.0.1. The manager forwards legacy moduleId/createData while
Monaco's public createWebWorker requires Worker|Promise<Worker>. A broad peer
range is insufficient runtime compatibility evidence. No dependency changes are
part of this repair.

Context7 retrieval was quota-blocked. Exact versioned primary sources and the
installed frozen package were used:

- [Monaco0.55.1 compatibility initialization](https://github.com/microsoft/monaco-editor/blob/v0.55.1/src/common/workers.ts#L84-L102)
  resolves the native worker, sends bootstrap then createData, then calls public
  editor.createWebWorker with the worker promise. The installed counterpart is
  esm/vs/common/workers.js; the source path is not a shipped module to import.
- [Monaco package's vscodeRef API](https://github.com/microsoft/vscode/blob/86f5a62f058e3905f74a9fa65d04b2f3b533408e/src/vs/editor/standalone/browser/standaloneWebWorker.ts#L32-L65)
  requires the worker and provides synchronization/disposal.
- [Manager2.0.1 forwarding](https://github.com/remcohaszing/monaco-worker-manager/blob/v2.0.1/index.ts#L105-L119)
  retains legacy options and owns restart/idle/disposal.
- [YAML5.5.1 worker requirement](https://github.com/remcohaszing/monaco-yaml/blob/v5.5.1/README.md#is-the-web-worker-necessary)
  explains why highlighting/typing alone does not prove schema-aware support.

withCatalogYamlWorker supplies an application-scoped facade only to
configureMonacoYaml. Its exact YAML legacy route is adapted to an initialized
native worker through the public API. Modern worker options delegate unchanged;
the original singleton and global API are not modified. Initialization failure
terminates the created worker. Existing schema/CSP/loader policy is preserved.
CatalogEditorImpl also disposes its YAML configuration on unmount, avoids
configuring the same mounted editor twice, and ignores a late import after
unmount. Actual Portal navigation/reopen cleanup remains a hosted acceptance
requirement; the isolated fixture's explicit disposer alone does not prove it.

The focused fixture bundles actual pinned Monaco/YAML plus the product adapter
using existing tsx's esbuild0.28.2. Context7 was also quota-blocked for esbuild;
[versioned build types](https://github.com/evanw/esbuild/blob/v0.28.2/lib/shared/types.ts)
and the [official build API](https://esbuild.github.io/api/#build) were consulted.
It is a separate component qualification, not the actual Next standalone bundle
or authenticated Portal Apply proof.

From identity-portal, with a new absolute owned output directory:

```sh
node scripts/monaco-worker-regression.mjs --build-only --output <new-owned-output>
node scripts/monaco-worker-regression.mjs --run --output <different-new-owned-output>
```

The run command creates only an ephemeral127.0.0.1 server and fresh browser
contexts; it never invokes default Playwright auth setup, a saved browser state,
Next, Docker or services. No browser installation is automatic. Traces,
screenshots and video are absent. Retained results contain only fixed booleans,
counts, asset digests and a fixed failure phase, never raw browser error prose.
All outbound requests must remain at the unique local origin. Browser/server
cleanup is recorded even on failure.

The legacy context must reject its actual provider call. Repaired contexts must
produce a real schema marker, resolve an internal reference and actual boolean
repair action, apply that edit, clear the marker with validation returning[],
restart with changed options, remove a synchronized model, close native workers,
and reopen without duplicate/stale providers. Unit doubles establish only the
boundary contract; actual-worker and full standalone acceptance remain pending
until their command results exist.

React44/PR45 remains at b68c2d1 with failed immutable64055a2 baseline page3/
console0. Hosted emitted bytes were not retained, and local chunk names differ;
the structural source correlation does not identify exact error messages or
establish React19.3 causality. Candidate/logout/transport did not run. This
separate baseline repair neither qualifies React44 nor completes original29.
After independently qualified delivery on Main, React44 needs an explicitly
reviewed new immutable case and complete baseline/candidate UI/auth/image proof.

First focused browser invocation at49e6807 failed in the repaired phase; its
exact substage was not retained. The legacy exact missing-handler negative
passed. Repaired mode created/closed one native worker and recorded zero page/
console errors and forbidden requests, but did not complete semantic assertions.
All owned processes/server/browser/profile cleanup passed; no positive worker
acceptance follows from this attempt.

Offline pinned source shows schema type mismatch is a Warning (yaml.worker.js
2943–2950), mapped by monaco-languageserver-types0.4.1 to Monaco Warning4 rather
than Error8. The fixture correction requires the exact controlled Boolean
warning at line1 columns10–16 and its fixed diagnostic condition, followed by the
same actual repair, cleared markers and validation[]. It also projects only a
fixed substage enum, so another failure identifies the semantic stage without
exporting caught error prose. This supports the corrected expectation; the
first attempt's precise runtime assertion remains unknown. A second invocation
has not yet run at this source checkpoint.

The second authorized focused invocation at a463281 passed: schema warning,
actual Boolean quickfix, cleared validation[], internal link, changed/restored
schema semantics, mirror removal and dispose/reopen. All6 native workers closed;
positive page/console/forbidden-request counts were0. That exact source also
passed113units/26files and normal fresh standalone build. This evidence does not
establish authenticated Portal Apply/unmount behavior.

The approved next scope is the explicit catalog-yaml case in the existing hosted
runner, preserving historical cases and graph assertions. Its source fence,
candidate-only Registry UI, synthetic catalog and worker identity/strict cleanup
contract are documented in the [proof README](../../identity-portal/tests/auth-compatibility/README.md).
Baseline UI is explicitly unexecuted/known-defective, never passed. Future hosted
proof must bind the final exact support source; no local Docker or repeated
product build/browser execution is authorized merely by these support edits.

First hosted PR47 attempt at af1a641 remains failed. Quality passed129/130 but
could not initialize a unit fixture from a463281, absent in its depth-one
checkout. The correction supplies minimal immutable unit snapshots and a real
temporary Git graph with only a baseline-ref seam; actual source/rename controls
also pass in a genuine shallow checkout with both historical objects absent.

The same hosted auth run40493262977 completed baseline auth/transport/outage and
both image/runtime/cleanup stages, with baseline UI explicitly unexecuted. The
candidate produced one real YAML worker and schema warning with page/console0,
but warning-decoration hover was intercepted by visible false text. Apply,
reopen and candidate logout/transport did not run. The reviewed test correction
keeps warning count/tooltip/strict-zero gates and ordinary hover on the single
visible controlled token, without force or timeout changes. This is preparation
for a future reviewed source push; no successful hosted qualification is claimed.

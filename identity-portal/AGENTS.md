---
docType: agent-entry
scope: repo
status: active
authoritative: true
owner: identity-center
language: en
whenToUse: Read before writing any code in identity-portal to pick up Next.js version-specific agent rules.
whenToUpdate: Update when the managed nextjs-agent-rules block changes or portal-level agent conventions change.
checkPaths:
  - identity-portal/AGENTS.md
  - identity-portal/CLAUDE.md
lastReviewedAt: 2026-10-28
lastReviewedCommit: 83643e49fe54a29fc371e1c428a746a03e19a2a8
lastReviewedNote: "Identity48 preparation: one shared source-bound receipt snapshot is validated and persisted, including parserSha256, with actual assembly/missing-binding controls. Public CommonJS and rooted Node ESM Zod paths now both execute bounded controls and bind resolved format entries, package and implementation-tree hashes. Focused82 controls pass; return-type-only JSDoc correction makes types/lint pass; previous failure retained. No sanitizer/graph/runtime-byte change, DOM/browser/Next execution, full suite/build, audit or publication; B/C remain reviewed next phases."
---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

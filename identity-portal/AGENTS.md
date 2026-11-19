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
lastReviewedAt: 2026-11-19
lastReviewedCommit: b3821ff2212d7cf6707c5b5090d1912badf60fdd
lastReviewedNote: "Identity #58 reviewed the existing ownership/design/DB and delivery boundaries for the scoped database graph and immutable source qualification. No product, deployment, production authorization or retained #49/#51/#52 scope changes."
---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

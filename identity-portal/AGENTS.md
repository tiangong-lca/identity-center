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
lastReviewedCommit: 65a4de21e933e5c97f00d1a625889ae5713313b7
lastReviewedNote: "Identity #58 reviewed the exact observed EC2-only hosted transport correction, zero-write non-applicable outcomes and hard context/IO failures. Existing dependency, signature, auth/image, timeout/retry, product/DB and retained #49/#51/#52 boundaries remain unchanged."
---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

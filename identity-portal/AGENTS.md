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
lastReviewedCommit: 10083691f0872cdc225cca950ca47c374138cf47
lastReviewedNote: "Identity48 image-proof support: existing one-off native Node image check now uses immutable image ID, read-only/network-none filesystem inspection before unchanged cleanup. Worker observes exact source inputs, all three sanitizer hashes, selected packages and trusted canonical app-Zod entry/implementation hashes. Runner binds actual sanitizer/client-Zod/server-Zod output and discovered loadable/NFT associations, distinct host expectations and framework vendor tracked-open49. Focused filesystem/inert workflow controls and retained B Runner positive exercised; host virtual-store old orphan rejection preserved, not an image failure. No Docker/image build/browser/network/audit/publication in support preparation; actual hosted image proof pending."
---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

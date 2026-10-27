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
lastReviewedCommit: 68e1fafce35e7e931ee0e7c65b5c6e0b4ccf8e8b
lastReviewedNote: "Identity48 PhaseA: exact Main68 security graph prepared with four caret changes, narrow overrides and AST/provenance-bound three-copy DOMPurify patch; Docker copies patches before frozen install. Baseline/updated frozen installs and focused provenance/source controls exercised; initial export-shape, historical-Docker fixture, workflow-selector and test env typing failures retained and corrected. Full units/build/browser/images/audit/hosted qualification remain pending Main review. Legacy esbuild Moderate remains explicit; no source deployment/provider action."
---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

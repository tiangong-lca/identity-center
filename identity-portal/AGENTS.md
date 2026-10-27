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
lastReviewedCommit: 83aa82c1a2a3d3b6058a33351cf54fc2011cfa8d
lastReviewedNote: "Identity48 correction preparation: applied only independently reviewed30version/142record restorations and incoming edges, preserving mixed security edges. Frozen install and2143physicaldependency/298peer checks pass; sanitizer patch/runtime bytes unchanged. Added separate source-bound three-sanitizer/Zod behavioral fixture and mandatory both-variant receipt gates; actual DOM/browser execution remains unrun pending PhaseC. Scoped checks and earlier failed controls are retained in correction evidence. Full suite/build/audit/hosted qualification and source/root delivery remain Main-reviewed future phases; no provider or Docker action."
---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

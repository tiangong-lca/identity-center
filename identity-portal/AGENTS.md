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
lastReviewedAt: 2026-10-27
lastReviewedCommit: 761511d3798c0609b53433d780b3e10eaf60bea5
lastReviewedNote: "Identity46 prepared scoped YAML Worker facade and unmount disposer using frozen Monaco0.55.1 initialization/public API. Manifest/lock and React44 remain unchanged. Six boundary units, lint/typecheck and focused bundle-only build pass; initial generic type error fixed and retained. Independent review corrections tighten legacy cause/schema update and host deadlines. Real browser worker, Portal Apply/lifecycle, full hosted qualification and Main publication review remain pending. No strict-zero relaxation, production or Docker operation; design bodies unchanged."
---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

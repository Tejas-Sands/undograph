# Railway deployment and resilient simulation implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task, with a final independent review.

**Goal:** Prepare the no-card Railway deployment and a visible, reliable fallback that demonstrates UndoGraph's complete correction/repair story.

**Architecture:** Keep the React frontend, AI and durable Workflows on Cloudflare. Add an authenticated HTTPS gateway that accepts named graph operations and uses the official SDK against a co-located FalkorDB with persistent storage on Railway. Build a guided browser simulation from the existing captured original/corrected/repaired snapshots; it is explicitly recorded, makes no API requests and remains independent of live work.

**Tech stack:** Existing React, native CSS, Hono, Zod, FalkorDB SDK, Vite, Node 24 and Docker. No new runtime dependencies.

**Spec:** User's October 16 request and the architecture/fallback described in `DESIGN.md`; this plan records the current scope decisions.

## Global constraints

- Work only in `/home/citrux/Sides/Hacks/fldb/undograph`.
- Every commit author/committer is Tejas-Sands <122252636+Tejas-Sands@users.noreply.github.com>, without co-author trailers.
- No card, paid provisioning, or stored GitHub token. External deployment needs supplied Railway access.
- Public network database operations use authenticated HTTPS. Plaintext database sockets are restricted to the gateway's loopback connection.
- Simulation is always labeled as a recorded synthetic simulation. Actual failures and confirmed live state remain visible until the user chooses simulation.
- Persistent bottom-left simulation entry and error recovery actions implement the user's explicit-button option. No automatic replay of a failed mutation.
- Preserve existing `#/recorded/...` and live routes, immutable graph behavior, quotas, ownership and real-inference behavior.

## Review focus

- Switching modes during a delayed live request must not replace or leak live/recorded data into the other mode.
- Gateway rejects absent/wrong credentials, unknown operations, arbitrary Cypher, foreign graph prefixes, oversized/malformed requests, redirects and unsafe remote HTTP configuration.
- Browser simulation must work when API requests fail and must label exported evidence as recorded/simulation.
- Empty/unavailable simulation assets and lazy-load failures must have finite recovery UI rather than an endless loader.
- The container must shut down both child processes, retain DB storage, expose only HTTP and become ready only after a real authenticated DB query succeeds.

## Task 1: Guided simulation and failure recovery

Files: `src/Root.tsx`, `src/App.tsx`, `src/useWorkspace.ts`, `src/components/AppShell.tsx`, new simulation components/styles; `tests/e2e/simulation.spec.ts`.

- [ ] Write browser regressions for bottom-left entry, no API requests, guided full story, IDs/hash preservation and labeled audit export.
- [ ] Observe RED; reuse captured snapshots and existing graph/panels for the guided simulation.
- [ ] Test failed readiness/action recovery, finite missing-fixture errors, viewport fit and mode isolation during an old read.
- [ ] Verify targeted landing/recorded/simulation browser flows and type/lint checks; commit the feature separately.

## Task 2: Authenticated named-operation gateway

Files: new `gateway/`, `worker/graph/gateway.ts`, `worker/graph/store.ts`, `worker/graph/client.ts`, `worker/env.ts`, configuration and real-DB gateway tests.

- [ ] Write failing contract tests for authenticated query/schema/owned-delete operations, strict payloads, prefix boundaries and failure sanitization.
- [ ] Add a Node HTTP service using existing Hono/Zod and store queries, plus a fetch adapter for Cloudflare. Keep direct TLS/local connection paths.
- [ ] Exercise real database schema, parameterized reads/writes, repair and deletion through the adapter. Verify invalid credentials/operations cannot reach the DB.
- [ ] Verify original backend suite and runtime compatibility; commit the gateway separately.

## Task 3: Railway container and deployment handoff

Files: Dockerfile, entrypoint, railway configuration, example environment files, build scripts and deployment docs.

- [ ] Package the gateway and pinned FalkorDB server with a persistent data mount, bounded readiness and signal handling.
- [ ] Build/run the actual container; test readiness, gateway auth, restart persistence and real application repair against it.
- [ ] Document Railway GitHub verification, no-card limits, volume, HTTPS domain, server secrets, Cloudflare environment wiring and rollback.
- [ ] Verify simulation remains available without remote services and commit deployment preparation separately.

## Task 4: Final verification and publication

- [ ] Run type checking, lint, backend/gateway tests, browser suite and production builds; inspect browser layouts and accessibility.
- [ ] Obtain independent review, fix findings and rerun affected checks.
- [ ] Scan tracked/browser artifacts for secrets, verify author/committer identity, fast-forward main and push the separate commits.
- [ ] Observe CI. Report precisely whether deployment is prepared or actually verified; list any missing external access.

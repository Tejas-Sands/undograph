# UndoGraph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the current session. Use superpowers:subagent-driven-development only if the user selects that execution method. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a professional Cloudflare-hosted support-agent demo that uses FalkorDB to trace and repair affected pending work after a source correction, with persistent sessions and evidence of preservation.

**Architecture:** A React SPA and same-origin Hono API run on Cloudflare Workers. Cloudflare Workflows executes bounded agent stages using Workers AI; FalkorDB owns artifact versions, input dependencies, revisions and run results. A deployed compatibility probe validates the official graph client before the product depends on it.

**Tech Stack:** TypeScript, Node.js 24 LTS, npm, React, Vite, Cloudflare Vite plugin, Wrangler, Hono, Cloudflare Workflows, Workers AI, official `falkordb` client, Zod, React Flow, Dagre, CSS variables, Lucide, Vitest and Playwright.

**Spec:** [DESIGN.md](DESIGN.md). Read the specification before implementation; exact fixture values, lifecycle semantics and exclusions are defined there.

## Global constraints

- Implementation begins no earlier than October 15, 2026, 12:01 AM IST; these files are preparation notes.
- Public deployment targets the user's Cloudflare Workers account; use an external TLS-enabled FalkorDB endpoint.
- Set Worker compatibility date to `2026-10-15` and explicitly retain `nodejs_compat`.
- FalkorDB is the canonical application database; application state must survive browser reload and Worker restarts.
- Use synthetic sources and tickets, immutable artifact content, recorded input versions and server-owned parameterized Cypher.
- Graph limits: 250 artifact versions per workspace and dependency depth 12; reject incomplete audits explicitly.
- Inference defaults: selected Llama 3.3 Workers AI model, temperature 0, 600 output tokens maximum; one output-correction attempt and one transient retry maximum.
- Visitor cookie lifetime is 24 hours; graph selection is derived from verified identity, never a browser graph-name parameter.
- Inference caps: 24 attempts per visitor hour and 400 globally per UTC day; new workspace cap: 100 globally per UTC day.
- Poll active runs every two seconds, pause while hidden, refresh on focus; avoid polling terminal runs.
- No external messages, payments or autonomous source-trust decisions; the release action only marks a synthetic draft reviewed.
- Use the existing approved idea and this folder; do not copy the pre-event prototypes as the submitted implementation.
- Dependencies are installed only when implementation begins and exact versions are committed in `package-lock.json`.

## Review focus

1. A second correction during model generation must make the old repair obsolete and prevent candidate promotion. Covered in Task 4.
2. A retried HTTP request after Workflow creation failed must resume the same queued run rather than leave an unrecoverable job or create duplicate work. Covered in Task 3.
3. A shared descendant reachable through two inputs must appear once in the repair set while its explanation retains both paths. Covered in Task 2.
4. Corrupt lineage with cycles or depth overflow must report an incomplete audit and block release; a small result cannot masquerade as a complete result. Covered in Tasks 2 and 4.
5. Model text with valid JSON but fabricated citations or inconsistent decisions must be rejected or marked for review, never shown as verified. Covered in Task 3.

## Planned file structure

One package at `undograph/`; no monorepo or speculative service framework.

| Files | Responsibility |
| --- | --- |
| `package.json`, lockfile, `vite.config.ts`, TypeScript configs, `wrangler.jsonc` | Runtime, build, preview and deployment configuration |
| `shared/contracts.ts` | Domain types and Zod boundary schemas |
| `worker/index.ts` | Hono routes, assets, bindings and scheduled cleanup entry |
| `worker/graph/client.ts`, `queries.ts`, `store.ts` | Client lifecycle, named Cypher and domain persistence |
| `worker/domain.ts` | Hashing, evidence validation, eligibility and repair ordering |
| `worker/agents.ts` | Bounded Workers AI requests and recorded input reads |
| `worker/workflows.ts` | BuildWorkflow and RepairWorkflow classes |
| `worker/session.ts`, `worker/limits.ts` | Signed identity, graph scoping, quota reservation and cleanup |
| `src/main.tsx`, `src/App.tsx`, `src/styles.css` | Browser entry, application shell and visual tokens |
| `src/lib/api.ts`, `src/lib/use-workspace.ts` | Typed API calls, server-state recovery and polling |
| `src/components/Workspace.tsx`, `SourceEditor.tsx`, `LineageView.tsx`, `ArtifactInspector.tsx`, `RunTimeline.tsx`, `RepairReview.tsx` | Six focused interactive views |
| `fixtures/northstar.json`, `fixtures/recorded-walkthrough.json` | Synthetic source inputs and separately labeled recorded example |
| `tests/domain.test.ts`, `tests/graph.integration.test.ts`, `tests/agents.test.ts`, `tests/workflows.test.ts`, `tests/api.test.ts` | Meaningful domain, graph and Worker checks |
| `tests/e2e/repair.spec.ts`, `scripts/cloud-smoke.mjs` | Complete browser story and deployed smoke checks |
| `docs/GRAPH.md`, `docs/DEPLOY.md`, `docs/VERIFICATION.md`, `docs/DEMO.md`, `docs/DECISIONS.md` | Submission materials and observed verification evidence |

Initialize Git inside this new folder only if it is not already covered by a writable repository. Each commit step below applies to that repository after the event starts; do not mutate the read-only parent `.git` directory.

## Task 1: Prove the Cloudflare and FalkorDB deployment path

**Files:** Create package/config files, `.gitignore`, `.dev.vars.example`, `worker/index.ts`, `worker/graph/client.ts`, `tests/runtime.test.ts`, `scripts/cloud-smoke.mjs`, `docs/DECISIONS.md`.

**Interfaces:**
- Produces `withGraph<T>(env: Env, graphName: string, work: (graph: Graph) => Promise<T>): Promise<T>`, where `Graph` is the actual imported SDK graph type.
- Produces `Env` with ASSETS, AI, BUILD_WORKFLOW, REPAIR_WORKFLOW, server-side graph connection fields and SESSION_SECRET. Bindings can be declared before later Workflow implementations exist; only export deployable classes when created.
- Health returns `{ ok: true }`; readiness returns `{ ready: true }` only after a real query and required schema checks, or a sanitized 503.

- [ ] Confirm the event has started; verify Node.js 24, npm and deployment-account availability.
- [ ] Scaffold the official React/Workers Vite template, add Hono and the official graph client, and initialize a writable project repository. Set the spec's compatibility date and lock dependency versions.
- [ ] Define scripts `dev`, `typecheck`, `test:unit`, `test:worker`, `test:graph`, `test:e2e`, `build`, `deploy:preview`, `deploy:production`. The local build must run in workerd; do not use a Node-only server to claim runtime compatibility.
- [ ] Write `tests/runtime.test.ts`: health works without DB credentials; readiness without credentials returns 503 and never includes credentials or raw connection strings. Run `npm run test:worker -- tests/runtime.test.ts`; observe the intended failing assertions before implementing the handlers.
- [ ] Implement `withGraph` with TLS verification, five-second connect timeout, query timeout and closure in `finally`; create sockets only in invocation scope. Implement health and readiness handlers.
- [ ] Execute an explicit disposable-graph probe from workerd: parameterized `MERGE`, repeated idempotent write, read, three-hop named path, connection close and deletion of that exact probe graph. Verify invalid credentials and invalid certificates fail.
- [ ] Deploy the probe to an authenticated preview after credentials are available; run `node scripts/cloud-smoke.mjs --base-url <preview-url> --probe`. Exercise one graph query inside a Workflow step as well. Require actual returned nodes and path IDs before declaring the architecture usable.
- [ ] If the client fails, record the error and invoke the spec's HTTPS-gateway fallback decision before proceeding. Do not silently replace the graph or claim success based only on bundling.
- [ ] Run typecheck, runtime tests and build. Record results in `docs/DECISIONS.md`, remove/protect probe mutations, and commit `chore: establish Cloudflare graph runtime`.

## Task 2: Implement versioned artifacts and dependency queries

**Files:** Create `shared/contracts.ts`, `worker/domain.ts`, `worker/graph/queries.ts`, `worker/graph/store.ts`, `fixtures/northstar.json`, `tests/domain.test.ts`, `tests/graph.integration.test.ts`, `docs/GRAPH.md`.

**Interfaces:**
- Produces all types and Zod schemas named in DESIGN.md, including `ArtifactWrite`, `CorrectionRequest` and `RunResult` for the persistence boundary.
- Produces `hashCanonical(value: unknown): Promise<string>`, `assessReturn(ticket: ReturnCase, facts: PolicyFacts): Assessment`, `planRepair(snapshot: WorkspaceSnapshot, impact: ImpactReport): RepairPlan`.
- Produces `queryGraph<T>(env: Env, graphName: string, query: QueryName, params: QueryParams): Promise<T[]>`; query names map to static Cypher, never browser text.
- Produces `ensureSchema(env, graphName): Promise<void>`, `loadSnapshot(env, graphName): Promise<WorkspaceSnapshot>`, `recordArtifact(env, graphName, input: ArtifactWrite): Promise<Artifact>`, `findImpact(env, graphName, sourceId): Promise<ImpactReport>`.

- [ ] Define fixture inputs with policy window 30, cases aged 21 and 7 days, and the independent password source/case. Seed only sources, cases, agents and sessions; generated outputs and DEPENDS_ON links must come from execution.
- [ ] Write the eligibility assertions: window 30 makes both cases eligible; window 14 makes age 21 ineligible and age 7 eligible; missing/ambiguous policy becomes needs-review. Write canonical-hash assertions for reordered object keys and changed input IDs. Run `npm run test:unit -- tests/domain.test.ts` and confirm the intended failures.
- [ ] Implement validated contracts, canonical hashing and deterministic eligibility with citations to exact artifact IDs. Keep rules in application code, not model prose.
- [ ] Write graph integration cases for immutable versions, idempotent artifact writes, five affected derived artifacts, independent password work, a diamond-shaped shared descendant, and foreign/missing IDs. Add cycle and depth-13 fixtures that require an incomplete-audit error.
- [ ] Implement schema initialization, static parameterized queries, artifact persistence and impact reads. Record content and input versions in one mutation. Enforce DAG/depth limits and deduplicate artifact sets while retaining explanation paths.
- [ ] Implement graph-derived topological repair ordering with explicit cycle detection. Old-to-new input mapping is by version ID, not similarity or artifact title.
- [ ] Run `npm run test:graph` with the explicit disposable test database configuration. Tests create unique graphs and delete only their own graphs in cleanup; absence of DB credentials must be reported as a skip, never a pass for database behavior.
- [ ] Update `docs/GRAPH.md` with the actual labels, directions, bounded traversal and primary Cypher queries. Run typecheck and unit tests; commit `feat: record versioned agent dependencies`.

## Task 3: Build actual agent work with durable run recovery

**Files:** Create `worker/agents.ts`, `worker/workflows.ts`, `tests/agents.test.ts`, `tests/workflows.test.ts`; extend contracts, store and API.

**Interfaces:**
- Consumes Task 2's persistence/domain functions and Task 1's AI binding.
- Produces `readInputs(env, graphName, stepId, artifactIds: string[]): Promise<Artifact[]>`, which records READ links before returning supplied inputs.
- Produces `extractPolicy(env, source: Artifact): Promise<PolicyFacts>` and `draftReply(env, input: ReplyInput): Promise<ReplyDraft>`.
- Produces `prepareRun(env, graphName, request: RunRequest, idempotencyKey: string): Promise<Run>` and `loadRun(env, graphName, runId: string): Promise<RunResult>`.
- Produces exported `BuildWorkflow extends WorkflowEntrypoint<Env, WorkflowParams>`; `WorkflowParams` contains trusted graphName, runId and baseRevision.

- [ ] Write tests that reject fabricated quote offsets, unsupported numerical evidence, non-JSON model output, foreign citations and decision disagreement. Test an explicit model failure remains a visible failure rather than switching to recorded mode. Run `npm run test:unit -- tests/agents.test.ts` and observe the intended failures.
- [ ] Implement bounded Workers AI calls with the spec's model, temperature, token limit and structured validation. Treat supplied sources as data. Unsupported extraction yields needs-review and no eligible release.
- [ ] Implement `readInputs`, stable step/artifact IDs, attempt logging and recorded output dependencies. Account-help drafting reads only its own source/case. Distinct analyst/reply roles and two work sessions are persisted.
- [ ] Write Workflow tests for a completed build, reopening state, persistence retry after a successful model response, idempotent run creation, and recovery when a Run was persisted but Workflow creation failed. A retry uses the same key and starts/recovers the same Workflow instance.
- [ ] Implement BuildWorkflow with explicit steps: reserve quota, interpret policy, persist facts, assess tickets, draft replies, and finalize the run. Existing validated facts may be reused only when their source version and prompt version match. Workflows checkpoints are execution aids; graph artifacts remain canonical.
- [ ] Implement the build/runs API routes with 202 responses and progress reads. On queued-run creation failure return a recoverable error and retain the same request identity; never return a successful launch without verifying instance creation/recovery.
- [ ] Run `npm run test:worker -- tests/workflows.test.ts`; run a live build on the preview against Workers AI and inspect the resulting graph. Record actual output validation and any provider usage; commit `feat: execute auditable support agent runs`.

## Task 4: Correct sources, repair affected work and block stale release

**Files:** Extend `worker/domain.ts`, `worker/graph/queries.ts`, `worker/graph/store.ts`, `worker/workflows.ts`, `worker/index.ts`, graph/domain/Workflow tests.

**Interfaces:**
- Produces `commitCorrection(env, graphName, input: CorrectionRequest): Promise<ImpactReport>`.
- Produces exported `RepairWorkflow extends WorkflowEntrypoint<Env, WorkflowParams>`.
- Produces `promoteRepair(env, graphName, runId: string, expectedRevision: number): Promise<RepairReport>` and `releaseDraft(env, graphName, artifactId: string, expectedRevision: number): Promise<Artifact>`.
- Produces stored reports that list rebuilt logical IDs and preserved artifact IDs/content hashes; output counters come from graph records.

- [ ] Write real graph tests: correcting 30 to 14 marks exactly five pending derived artifacts stale; the independent reply ID/hash remain identical; stale release returns 409; two corrections with the same expected revision allow only one to succeed.
- [ ] Implement source version creation, old-source supersession, Change links, descendant invalidation and revision increment in one guarded mutation. Validate the synthetic correction field and explanation. Released historical records keep their release status and receive a review flag.
- [ ] Write repair tests for topological ordering, all five replacements, unchanged eligibility of age 7, changed eligibility of age 21, partial model failure, duplicate request, corrupt lineage, and a second source correction while a repair is running. The last case must leave candidates unpublished and mark the run obsolete.
- [ ] Implement RepairWorkflow using the graph-derived plan. Persist candidates and dependencies idempotently; map affected old inputs to staged replacement IDs. Retry only transient failures under explicit limits.
- [ ] Implement guarded final promotion of the entire candidate set, old-version supersession and report persistence. A failed or obsolete repair leaves pending work stale; do not advertise a completed repair based on partial stages.
- [ ] Implement release freshness checks over the entire recorded ancestor path and revision in the mutation itself. It changes only internal review state and never sends a message.
- [ ] Run `npm run test:unit`, `npm run test:graph` and the Workflow tests. Execute the full correction/repair on the preview; inspect actual hashes, version IDs and paths. Commit `feat: repair dependent work after source correction`.

## Task 5: Make the public demo isolated and bounded

**Files:** Create `worker/session.ts`, `worker/limits.ts`, `tests/api.test.ts`; complete API routes, bindings, control-graph queries and `.dev.vars.example`.

**Interfaces:**
- Produces `verifyVisitor(request: Request, env: Env): Promise<VisitorSession>`, `workspaceGraphName(session: VisitorSession, env: Env): Promise<string>` and `assertSameOrigin(request: Request): void`.
- Produces `reserveInference(env, visitorId: string, now: Date): Promise<void>` and `cleanupExpiredWorkspaces(env, now: Date): Promise<CleanupResult>`.
- Produces every route in DESIGN.md, uniform API errors and an export containing synthetic records without cookies, secrets or internal connection values.

- [ ] Write API tests for tampered/expired cookies, cross-origin mutations, bodies larger than 16 KiB, foreign artifact/run IDs, conflicting Idempotency-Key payloads, quota exhaustion and safe export contents. Run `npm run test:worker -- tests/api.test.ts`; confirm intended failures.
- [ ] Implement signed 24-hour visitor sessions and server-derived per-workspace graph names. Add graph ownership scoping to every read, mutation and Workflow launch. Validate requests with shared schemas.
- [ ] Implement atomic attempt reservations and new-workspace limits in the control graph using exact spec values. Count failed and retried inference attempts. Return helpful 429 errors without fabricating work.
- [ ] Implement scheduled expiry cleanup and reset. Test that only registry-confirmed expired project graphs can be deleted; never delete another workspace, control graph or graph named by request input. Reset creates a fresh generation so old Workflows cannot publish into the replacement workspace.
- [ ] Complete workspace recovery, sessions, impact, release and audit export routes. Check readiness verifies schema and a live graph query, while health remains independent.
- [ ] Run the Worker/API tests and real graph isolation tests. Scan browser build outputs for server secrets. Commit `feat: isolate and bound public demo sessions`.

## Task 6: Build the professional operations workspace

**Files:** Create browser files and the six components in the file map; add licensed local fonts/icons, the recorded walkthrough fixture and `tests/e2e/repair.spec.ts`.

**Interfaces:**
- Consumes the shared contracts and complete API.
- Produces `request<T>(path: string, init?: RequestInit): Promise<T>` with typed error handling, and `useWorkspace()` returning snapshot, active run, loading/error state, refresh and mutation actions.
- All stateful UI actions use server responses; browser counters and statuses must not be fabricated or advanced by animation timers.

- [ ] Write the browser acceptance skeleton: enter a workspace, start a live build, see two sessions, reload, correct policy to 14, inspect five affected artifacts, observe stale release rejection, repair and inspect the changed/preserved results. Also test that another browser context cannot access the first workspace.
- [ ] Implement API calls and polling with the exact two-second active interval, hidden-tab pause, terminal-run stop and error recovery. Preserve request keys across retry and navigation.
- [ ] Create the app shell and CSS tokens using DESIGN.md's restrained direction. Self-host IBM Plex Sans and JetBrains Mono with license files. Finalize desktop and responsive layouts during the event; implement navigation and empty/loading/error states.
- [ ] Implement source editing and correction review with revision conflict recovery; artifact inspection with provenance and before/after content; and run history with honest step/attempt status.
- [ ] Implement the React Flow/Dagre lineage view from graph data, node selection, fit/zoom controls and a keyboard-accessible path list. Show dependency direction in human language even though stored DEPENDS_ON edges point from output to input.
- [ ] Implement repair review and release controls. Explain preserved/rebuilt work with actual IDs/hashes and source citations. Historical releases have an explicit review state, not a pretend undo action.
- [ ] Add a read-only recorded walkthrough with permanent recorded-mode labeling. Its data is separate from live mode and cannot bypass live failures or produce live release/repair actions.
- [ ] Run `npm run test:e2e` against a disposable graph and actual running Worker. Review screenshots at 375, 768, 1024 and 1440 pixels; check keyboard flow, reduced motion, color-independent statuses, inline errors and console/network failures. Fix observed issues and commit `feat: add professional agent repair workspace`.

## Task 7: Verify the complete cloud flow and prepare the submission

**Files:** Complete `scripts/cloud-smoke.mjs`, `docs/DEPLOY.md`, `docs/VERIFICATION.md`, `docs/DEMO.md`, README, configuration and `.github/workflows/check.yml`.

**Interfaces:**
- Produces `node scripts/cloud-smoke.mjs --base-url <url>`: creates an isolated test visitor, runs the actual scenario, verifies repair/preservation and returns nonzero on failure. It creates only synthetic records and cleans up its own workspace.
- Produces reproducible local and cloud instructions, exact graph-query documentation, observed verification evidence and a working demo URL.

- [ ] Run typecheck, unit, Worker, real-graph and browser checks, then `npm run build`. Record pass/skip/failure counts and the actual environment. Do not describe skipped integration tests or recorded-mode inference as live verification.
- [ ] Document Cloudflare login/token setup, AI and Workflow bindings, graph TLS requirements, server secrets, preview/production prefixes, resource limits and local development. Keep actual credentials out of docs and command-line arguments.
- [ ] Deploy preview with `npm run deploy:preview`. Run cloud smoke with live inference; confirm reload persistence, graph paths, revision conflicts, unavailable-DB behavior, stale release protection, repair retry, and hash preservation.
- [ ] Deploy production only after preview checks pass and account access/resources are available, using `npm run deploy:production`. Verify the returned live URL, deep links and full smoke scenario. Preserve a rollback version and document how to disable live inference if quota is exhausted.
- [ ] Record measured model calls and duration for selective repair and a full rebuild on the same synthetic fixture. Report the actual result even if selective repair is slower; include immutable-ID/hash preservation as a separate result. Do not prefill performance numbers.
- [ ] Prepare a three-minute recording: original work and two sessions; source correction; graph-selected impact; blocked stale release; repaired response; preserved independent reply; reopening and export.
- [ ] Prepare a public repository with setup, diagram, central Cypher, track choice, asset licenses and AI-assistance disclosure. Have the participant walk through the graph model and queries before submission. Submit before October 18, 11:59 PM IST.
- [ ] Update README to reflect implemented behavior and limitations, link the verified deployment, and commit `docs: publish verified hackathon demo`.

## Self review and execution handoff

The plan covers the specification's runtime gate, synthetic scenario, graph ownership, correction and repair semantics, candidate promotion, stale-release guard, inference limits, recovery, visual experience and deployed verification. The five review-focus conditions have owning test tasks. Typed interfaces and file names are consistent across tasks.

Infrastructure prerequisites remain external: Cloudflare account access with AI/Workflows availability, a reachable TLS-enabled FalkorDB endpoint and any agreed hosting budget. These do not prevent reviewing the plan. They do prevent claiming a live deployment until verified.

Recommended execution: native implementation in this session, task by task, to keep context overhead down. Review DESIGN.md and this plan before implementation; the main code also must wait until the event starts. Neither review nor infrastructure provisioning is represented as already complete.

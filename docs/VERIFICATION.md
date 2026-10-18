# Verification record

Latest status (October 17, 2026, IST): the public Cloudflare preview and Railway HTTPS gateway passed the complete real-Workers-AI smoke. Browser verification also completed a public live build and recovered from network failure into the labeled simulation while offline. The original 111 backend cases, ten gateway cases and 65 HTTP-adapter graph/API/Workflow cases pass. CI passes its browser cases with live inference explicitly skipped; earlier local acceptance passed all 27 browser cases with real inference enabled. The operator confirmed a `/data` Railway volume; a forced public database restart was not performed. Earlier sections record their status at each milestone.

## Public preview and free-plan Workflow correction — October 17, 2026 (IST)

- Website: <https://undograph-preview.the-workflow-worker.workers.dev>
- Live workspace: <https://undograph-preview.the-workflow-worker.workers.dev/#/overview>
- Guided fallback: <https://undograph-preview.the-workflow-worker.workers.dev/#/simulation/overview>
- Railway gateway: <https://undograph-production.up.railway.app/health>
- Application code: `5841271d1924b633ed359e26e6ba22a8ed7cd2c9`; [CI passed](https://github.com/Tejas-Sands/undograph/actions/runs/38946088855).
- Verified Cloudflare preview version: `9eb307c5-c559-4737-8941-60a1dc6abe51`.

The first public build exposed Cloudflare Free's 50-subrequest limit. Three inference stages and their checkpoints succeeded before the remaining model/database calls failed; the graph reconciled the ended Workflow to a visible failure. A local regression enforcing the same hard cap reproduced the failure. The fix executes the existing guarded `openStep` and `saveOutput` functions beside FalkorDB through two validated, authenticated gateway operations. Inference remains separately checkpointed, and lineage, revision, quota and immutable-write checks remain active. The regression passes complete build and repair with a structured-output correction at every model stage and a repeated save after a lost acknowledgement. Independent review also caught a lost `WORKSPACE_EXPIRED` code on HTTP 404; its focused test failed before the adapter correction. [Cloudflare Workflow limits](https://developers.cloudflare.com/workflows/reference/limits/).

`node scripts/cloud-smoke.mjs --base-url https://undograph-preview.the-workflow-worker.workers.dev --benchmark` exited successfully after both deployments used the fix. It verified readiness, synthetic input seeding, actual live inference and durable Workflows, duplicate-run recovery, reopening identical records, two sessions, six published outputs, five affected artifacts and a multi-hop path, revision-conflict refusal, stale-review refusal, five repaired artifacts, both return decisions, corrected-source citations, exact preservation of the unrelated account reply, internal review, live audit export and foreign-visitor refusal. All of the smoke's owned terminal workspace graphs were deleted.

| Public observed run | Model calls | Persisted duration | Input tokens | Output tokens |
| --- | --- | --- | --- | --- |
| Original build | 4 | 15.267 s | 1,100 | 188 |
| Selective repair | 3 | 12.955 s | 924 | 167 |
| Fresh build on the same corrected source/case content | 4 | 15.145 s | 1,141 | 226 |

These are small-fixture measurements from one public run, not a throughput or latency guarantee. The independent reply retained its complete record and content hash `1a034ffbda4d28a16ceaa2f805f888c329c30d4025b2c43df0203b4c56a890b9`.

Browser checks used the public site's actual controls to start a workspace and complete a live build. With that isolated browser offline, **Refresh workspace** displayed the live error and **Continue in simulation**. Following the recovery link opened `#/simulation/overview`, retained the recorded-data label and guided controls, and added no API resource requests (21 before and after the transition). Restoring networking allowed deletion of only that browser's completed test workspace (`HTTP 200`, `deleted: true`). Earlier public browser checks completed all five simulation steps and downloaded its labeled audit entirely offline. Desktop and mobile layouts were inspected; the 390-pixel viewport measured a 390-pixel document width.

The operator confirmed the Railway storage volume is attached at `/data`. Readiness and application reload recovery are verified; this run did not force a Railway restart or measure actual account spend. Local production-container checks independently passed volume recovery, graceful shutdown and database-child failure with generated, short and quoted passwords. Supplied credentials were read from the user-designated file without being printed or copied into the repository; connection secrets are configured only on the server.

## SDK connection failure recovery — October 16, 2026

CI on the password fix exposed an unhandled `SocketClosedUnexpectedlyError` in the pinned FalkorDB 6.8.0 SDK. The SDK forwards Redis socket errors before returning its client, preventing callers from registering an error listener in time. A real local TCP server that closes accepted sockets reproduced the Node-process crash in a child-process test.

A narrow install-time patch registers the SDK error listener immediately after construction. Connection failure still rejects the promise and reaches the existing sanitized error path. It adds no global exception handler or dependency. The patch is idempotent and fails on an unexpected SDK version/layout; Docker applies it explicitly despite ignoring lifecycle scripts. The same socket-reset test passes inside the rebuilt production image.

After the fix, the 111 original backend cases and nine gateway cases pass. All 64 graph/API/Workflow cases pass through the HTTP adapter with test files serialized against their shared DB/gateway; concurrency assertions inside individual tests remain active. Type checking, lint, Worker/client build and all three actual-container password/lifecycle scenarios also pass. The earlier concurrent integration run returned three timeouts/unavailability failures; serialized execution completed all 64 cases in 47.38 seconds.

## Railway password startup correction — October 16, 2026

The initial gateway rejected ordinary database passwords shorter than 32 characters before starting FalkorDB. A generated 12-character test password reproduced the container startup failure. The corrected configuration accepts non-empty passwords up to 512 UTF-8 bytes, rejects control characters and quotes/escapes the password before sending Redis configuration through stdin. It does not log or store supplied cloud credentials. The separate gateway bearer token still requires at least 32 characters.

`npm run test:gateway` passes eight cases, including the new password boundary/injection tests. Type checking, lint and the gateway production build pass. The actual rebuilt Docker image passes the complete `test:railway` smoke with each `UNDOGRAPH_RAILWAY_PASSWORD_CASE`: `generated`, `short` (12 characters), and `quoted` (spaces, quotes, backslash and Unicode). Each case verifies authenticated readiness, operation/prefix refusal, persistence after restart, graceful SIGTERM and failure propagation when the database stops. These are generated test passwords, not user-supplied credentials.

The user confirmed the database remains inside Railway. A separately managed FalkorDB Cloud instance is not configured or seeded by this container; synthetic application inputs are created through **Start live workspace**. Deployment instructions now distinguish these two databases and explain missing variables and first-deploy retries.

## Railway gateway and guided simulation — October 16, 2026

| Check | Observed result |
| --- | --- |
| `npm run typecheck`, `npm run lint` | Passed for browser, Worker, gateway, tooling and tests |
| `npm test` | 111 passed: 43 unit, four Worker, 64 real graph/API/Workflow cases |
| `npm run test:gateway` | Five passed: authentication, strict named operations/prefixes/body limits, sanitized failures, schema/read/write/delete, unsafe HTTP and redirect/malformed-response refusal |
| `npm run test:gateway:worker` | All 64 existing real graph/API/Workflow cases passed through the HTTP adapter in workerd |
| `UNDOGRAPH_LIVE_AI=1 npm run test:e2e` | All 27 passed, including real inference, correction, stale review, repair, simulation, offline entry, layout, focus and mode isolation |
| `npm run build`, `npm run build:gateway` | Website/Worker and Node gateway builds passed |
| `docker build -t undograph-railway:test .` | Built with pinned Node builder and FalkorDB base digests |
| `npm run test:railway` | Actual container: authenticated readiness, token refusal, named-query/prefix refusal, persistent write, clean exit 0 on SIGTERM, retained data after restart, exit 1 when DB child stops |
| Container memory sample | 102.2 MiB with a 1 GiB limit, small synthetic dataset; not a sustained-load measurement |
| Real AI application smoke through the built container | Passed health/readiness, build, reload read, correction, impact, stale-review refusal, duplicate-run recovery, selective repair, review, foreign-visitor refusal and audit export |
| Accessibility | New simulation guide: axe-core 4.12.1, 12 passes, zero violations or incomplete checks; keyboard and viewport coverage in browser tests |
| Secret scan | Tracked files and every browser build asset contain neither generated local/railway secrets nor GitHub-token patterns; private credential files remain ignored and untracked |

The container application proof temporarily connected the local Worker to its loopback HTTP gateway, while inference used the actual remote Workers AI binding. The original local configuration was restored and the disposable proof container removed. Its two measured runs were:

| Run | Model calls | Persisted duration | Input tokens | Output tokens |
| --- | --- | --- | --- | --- |
| Initial build `run_b696ce9155583726b798775664c6f585` | 4 | 8.716 s | 1,084 | 188 |
| Selective repair `run_d1116ec6b16c156169324d093446b37e` | 3 | 6.558 s | 910 | 171 |

Exactly five artifacts were affected/repaired. The 21-day case became ineligible; the 7-day case stayed eligible. Independent reply `run_b696ce9155583726b798775664c6f585_reply-A001_output` retained SHA-256 `1a034ffbda4d28a16ceaa2f805f888c329c30d4025b2c43df0203b4c56a890b9`. Owned terminal workspace graphs were deleted. These are lifecycle measurements, not a fresh-build comparison on identical corrected inputs or a speed guarantee.

The simulation has five guided steps with a permanent recorded-synthetic label and labeled exports. It makes no API requests and works after initial page assets load even if the connection then drops. Browser tests check 375/768/1440-pixel simulation layouts, full preserved ID/hash and both return decisions in exports, delayed readiness/read/mutation transitions, source-link stage preservation and unobstructed desktop sidebar controls. Captured evidence and graph code ship in the entry bundle (~688 KB minified / 198 KB gzip), intentionally trading a larger initial download for reliable later fallback. A cold offline page load is not supported.

Independent review found desktop launcher overlap and unmounted live controllers initiating follow-up reads. Three regressions first failed, then passed after sidebar spacing and lifecycle guards. A source-link mode regression also failed before its fix. Focused rereview found no remaining blocker. Simulation grouping was corrected after an accessibility check; the rerun has no incomplete checks.

The gateway uses `redirect: manual` and rejects redirects: workerd does not support `redirect: error`. Local HTTP is permitted only for loopback in local mode. Remote configuration requires HTTPS and a server-only bearer token. This local verification does not establish Railway provisioning, public certificate behavior, remaining account credits, or a deployed Cloudflare-to-Railway flow. Follow [the Railway guide](RAILWAY.md) and run the smoke again against the public website after account setup.

## Local runtime — October 15, 2026

Environment: Node.js 24.17.0, npm 11.13.0, Docker 29.8.2, Wrangler 4.151.0, Vite 8.3.4, official FalkorDB client 6.8.0, Vitest 4.1.11 and Cloudflare Vitest plugin 1.4.2. The database image is pinned by digest in `compose.yaml`.

| Command | Observed result |
| --- | --- |
| `npm run typecheck` | Passed for application, Worker, tooling and tests |
| `npm test` | 12 passed: 2 local-setup, 4 Worker API and 6 real-database/runtime tests; no skips |
| `npm run build` | Passed for Worker and React client |
| `npm run lint` | Passed |
| `node scripts/cloud-smoke.mjs --base-url http://127.0.0.1:5173` | Health, actual database readiness and application document passed |
| Browser build scan | Local database password and session secret absent from every file in `dist/client` |

The graph checks execute in workerd against the authenticated local FalkorDB container. They verify repeated parameterized writes without duplicate nodes, an actual three-hop path, safe disposable-graph deletion, rejection of incorrect credentials, rejection of plaintext production configuration, connection closure after a failed callback, and a parameterized query inside a real local Cloudflare Workflow step.

The health/readiness tests were first observed failing against the generated starter handler. Local-configuration tests were first observed failing before the setup script existed. Socket naming/cleanup was observed failing before invocation names were added. The running-server smoke check caught a Vite/CommonJS loading issue after the unit/runtime suite and bundling had passed; it passed after correcting dependency resolution.

This is runtime-foundation verification. It does not establish agent execution, source correction, selective repair, visitor isolation, browser acceptance, or a deployed cloud service. Those milestones require their own checks. Certificate refusal against a real TLS endpoint and deployed preview/production probes remain pending; they are not represented as passed.

## Artifact and dependency storage — October 15, 2026

`npm test` passes 48 tests with no skips: 26 unit, 4 Worker API and 18 real-database/runtime tests. Type checking, production build, lint and the running-server HTTP smoke check pass. The domain suite first failed 15 assertions before implementation; the initial ten graph integration cases first failed before storage existed.

Checks cover 30/14-day deterministic eligibility, canonical hashes, exact quoted evidence, idempotent initialization and immutable writes, candidate versions, concurrent current-version writes, native unique constraints, exact five-artifact return-policy impact, independent account-reply preservation, fan-in path deduplication, foreign IDs, revision conflicts, cycles and depth thirteen. Initial sources have zero affected outputs before any agent reads them.

Generated support artifacts in these graph tests are explicit test fixtures written through the real store. Production initialization does not seed generated work. These results establish persistence and planning behavior, not actual model execution or completed repairs.

## Durable support builds — October 15, 2026

`npm test` passes 77 tests with no skips: 42 unit, 4 Worker API and 31 real-database/runtime/API/Workflow tests. Type checking, lint and production build pass. The local HTTP health/readiness/document smoke passes. A browser-bundle scan confirms local database/session secrets are absent.

The sixteen model-validation tests first failed before implementation. Workflow and API suites first failed before their implementation. Additional tests exposed two recovery defects before fixes: concurrent identical requests conflicted, and repeating finalization after publication rejected an already successful run. Both now pass.

Native Workflow tests cover successful publication and visible authorization failure; the latter caught an unintended retry caused by changing the required `NonRetryableError` name. Authorization failure now records one model attempt and the correct error code. The local engine emits diagnostics for this intentionally failed native instance and caught duplicate-instance creation. Assertions verify persisted terminal state rather than treating those diagnostics as a successful run.

A real local HTTP build, using the remote Workers AI binding and the selected Llama model, succeeded as `run_0a76222896b827ded646e62e8e6da75e`. It produced six current outputs, two work sessions, six completed steps and thirteen recorded reads. Four provider calls reported 1,100 input and 188 output tokens in total. Persisted elapsed time was 9.049 seconds. This was live inference, not test-provider or recorded-walkthrough output.

Other checks cover a saved run whose Workflow launch fails, same-key recovery, foreign run refusal, signed cookie recovery/tampering, separate visitor graphs, exact-origin writes, bounded request bodies, and persistence retries that reuse model output. Full correction/repair, reset/cleanup/export and browser acceptance remain pending. The live build used a local database and local durable engine; it is not deployed-cloud or TLS verification.

## Correction and selective repair — October 15, 2026

`npm test` passes 90 tests with no skips: 43 unit, 4 Worker and 43 graph/API/Workflow cases. Type checking, production build and lint pass. Ten real-graph repair cases cover exact invalidation, competing corrections, all-or-nothing publication, revision obsolescence, released-history review, ancestor freshness, duplicate promotion, corrupt lineage and consecutive corrections. The initial nine cases were observed failing against the unimplemented repair interfaces. An additional HTTP test verifies the complete route sequence.

Live acceptance exposed an exact-evidence check that unnecessarily required the quotation's terminal period. The provider returned the full supporting statement without that period. A regression test was observed failing, then passed after accepting the exact statement substring with verified offsets and numerical evidence. Fabricated quotations remain rejected. Another regression was observed failing before returned provider usage from rejected structured responses was persisted; it now passes.

The complete local HTTP scenario passed with real Workers AI. Build `run_9a4f135a59eab7c46b3eac968dfa1218` used four calls, 1,108 input tokens, 188 output tokens and 8.417 seconds. Correction from 30 to 14 days invalidated exactly five outputs. A stale reply release returned 409. Repair `run_4cf2f886ca77acbc7ad22367f2609f45` used three calls, 918 input tokens, 162 output tokens and 8.798 seconds. It atomically published five replacements; the 21-day case became ineligible and the 7-day case stayed eligible. The independent account reply retained its complete original artifact record, including ID and hash.

Selective repair used one fewer model call in this observation but was slightly slower in elapsed time. This is one local observation, not a controlled performance benchmark. Earlier failed live validation runs remain failed in the test workspace; unavailable historical measurements are not filled in as zero. Browser acceptance and deployed TLS/cloud verification remain separate pending checks.

## Visitor lifecycle, quotas and export — October 15, 2026

The complete backend suite passes 100 tests with no skips: 43 unit, 4 Worker and 53 graph/API/Workflow tests. The initial export, reset, work-session and cleanup cases failed before implementation; three quota cases already passed the reservation primitives introduced with live builds. An added lost-reset-response regression failed before recovery was implemented. All twelve API tests then passed again, alongside type checking, lint, production build and local HTTP smoke. A fresh browser-bundle scan found no local database or session secrets.

Concurrent reservations accept exactly 24 of 26 requests for one visitor hour and allow the next hour. With 399 global attempts already consumed, only one competing visitor reservation succeeds. With 99 daily workspace allocations, only one new allocation succeeds and reopening it consumes no allocation. Known quota exhaustion returns HTTP 429 before a new run is created.

Cleanup deletes one expired registered visitor graph while retaining a live registered graph, an unregistered project graph, the control graph and an unrelated registry name. Reset requires confirmation, closes only the selected generation, marks its queued run obsolete and prevents that run restarting. The replacement retains the visitor quota identity, has five seed inputs and no generated outputs; another visitor's snapshot remains identical. A client using its previous cookie after losing the reset response can recover a fresh generation.

Checks also cover authentically signed expired cookies, tampering, absent origin evidence, malformed JSON, body bounds, safe synthetic export and actual empty work-session creation. Integration suites now explicitly report skips when database credentials are absent. Cloud scheduling, TLS and public hosting remain unverified; local cleanup behavior is exercised directly against real disposable graphs.

## Operations UI and browser acceptance — October 15, 2026

`UNDOGRAPH_LIVE_AI=1 npm run test:e2e` passes all nine browser tests, with no skips. The live case uses real Workers AI and the running local Worker, Workflows engine and FalkorDB. It verifies building six outputs in two sessions, reload recovery, a fourteen-day correction, five stale artifacts, HTTP 409 for stale review, five repaired outputs, changed/unchanged eligibility, independent-reply preservation, export and a foreign-browser run refusal.

Four read-only recorded layouts pass at 375, 768, 1024 and 1440 pixels. They create no API mutation requests and have no horizontal page overflow. Screenshots at all four sizes were inspected. The frozen fixture uses captured synthetic records and permanent recorded-mode labeling; it is not live inference verification.

Four browser regressions were observed failing before fixes: a delayed older read hid a successful correction, resizing a loaded graph clipped nodes, Escape lost the dialog trigger's focus, and graph nodes lacked a working native keyboard inspection action. Forced post-mutation reads now follow existing reads; a ResizeObserver refits the graph; dialog cleanup restores its trigger; native node buttons open the inspector and restore focus when it closes. All four checks pass. The initial workspace test also failed against the placeholder UI before implementation.

Agent-browser/axe 4.12.1 initially found three contrast failures. Those and unsupported label roles were corrected; checked final desktop, mobile and live-source views report zero violations. A transformed-canvas contrast check remains classified incomplete by the tool, so visual review and the equivalent keyboard input list complement the automated result. Reduced-motion emulation reports zero-duration transitions. No application runtime errors were observed in the successful browser flows.

Type checking, lint and the production build pass. The graph renderer and recorded fixture load in separate chunks; fonts are self-hosted with license notices. Browser and recorded-fixture scans find no local database password or session secret. Public cloud hosting and TLS checks remain deferred by the local-first scope.


## Repeatable complete smoke and fair comparison — October 15, 2026

Before final review, the backend run passed 102 tests without skips: 43 unit, 4 Worker and 55 real graph/API/Workflow tests. Type checking, lint and the production build pass. The offline browser path passes eight tests and explicitly skips its one real-inference case. The earlier live browser run passed all nine.

Cleanup tests were observed failing before the owned deletion route existed, then passed. A further regression first returned 500 for an old cookie reading its deleted graph; it now returns 404 and can recover a fresh signed generation. Deletion refuses active work, requires confirmation, preserves another visitor's complete snapshot and cannot reset the visitor quota identity.

The full `cloud-smoke.mjs --base-url http://127.0.0.1:5173 --benchmark` scenario passed using real Workers AI, local Workflows and the local FalkorDB container. It verified all five affected/repaired artifacts, a multi-hop dependency path, duplicate request recovery, reload persistence, competing correction 409, stale review 409, new source citations, eligibility changes, current internal review, safe export and foreign run 404. All script-owned terminal workspace graphs were deleted afterward.

| Observed operation | Model calls | Persisted duration | Input tokens | Output tokens |
| --- | ---: | ---: | ---: | ---: |
| Initial 30-day build | 4 | 9.421 s | 1,088 | 187 |
| Selective 14-day repair | 3 | 8.899 s | 921 | 174 |
| Fresh build on the same corrected policy/cases | 4 | 9.458 s | 1,145 | 226 |

Run IDs: initial `run_74469733166c929acce6874e663e25bb`; repair `run_ebf3149b8a627d6160faa904a68832c3`; corrected-fixture build `run_5913a439d3c7036171530f43e7277289`. The comparison asserts identical corrected source content hash and all case hashes. This is one observation, not a statistical performance claim. An earlier repair was slower than its original build, as recorded above.

The independent reply retained its complete artifact record, including ID `run_74469733166c929acce6874e663e25bb_reply-A001_output` and SHA-256 `1a034ffbda4d28a16ceaa2f805f888c329c30d4025b2c43df0203b4c56a890b9`. ID/hash preservation is separate from elapsed-time comparison. Provider usage was returned for these runs; unknown usage is reported as unavailable elsewhere, never filled in as zero.

The smoke script now defaults to this actual agent scenario; its `--probe` option supplies the liveness/readiness/document-only behavior used in earlier foundation checks. Public cloud deployment, invalid-certificate refusal against a real TLS endpoint, a completed video and event submission are not claimed by these results.

## GitHub Actions

[Checks run 38714172015](https://github.com/Tejas-Sands/undograph/actions/runs/38714172015) completed successfully for commit `638adf995fa109b34a61261fd7c654850ed93619`. The GitHub-hosted Ubuntu runner installed Node 24 and dependencies, generated its own local credentials, started the pinned authenticated FalkorDB container, and passed type checking, lint, all backend tests, offline browser checks and the production build. No Cloudflare credential was supplied to CI; live Workers AI is explicitly outside that job.


## Independent final review and fixes

A fresh reviewer checked the full implementation against the specification, plan, recorded decisions and all five review-focus cases. It found two Important issues and no Critical or Minor findings. Both were reproduced before changes and fixed in one pass:

- Publication could finish after a correction's impact read without changing revision or artifact count. Correction now also guards the captured active-run identity, including null. Deterministic build- and repair-publication interleavings first failed; they now return 409 and a retry invalidates all five newly current descendants.
- If database retries were exhausted while recording a run failure, the graph could remain active after its Workflow ended. Owned workspace/run reads and launch recovery now reconcile definitive errored, terminated or completed engine state through guarded failure recording. Unavailable or missing status preserves graph state. Regressions simulate failure of the failure-recording step itself, recover through all three paths, permit a replacement run, and confirm no private engine error is persisted.

The complete backend suite now passes 111 tests without skips: 43 unit, 4 Worker and 64 graph/API/Workflow cases. The targeted graph/Workflow/API run passes 42 tests. Tests use real disposable FalkorDB graphs; provider responses and terminal status in recovery fixtures are explicitly controlled. Runtime diagnostics from intentionally absent Workflow instances are caught by the preservation path and are not evidence of live inference. Type checking and lint pass.

After both review fixes, the fresh `UNDOGRAPH_LIVE_AI=1 npm run test:e2e` run passed all nine tests with no skips, including the complete real-inference build/correction/repair flow. The fixes have separate commits: `a75df12` for the publication guard and `4412b8a` for terminal Workflow recovery. [Execution decisions and deferred scope](EXECUTION.md) retain the implementation rulings.

Final production build passes. Scans of tracked files, all Git-history blobs and the browser bundle find no supplied GitHub tokens or local database/session secrets. All commits use Tejas-Sands as both author and committer, without co-author trailers.


## Landing page — October 15, 2026

The root landing-page acceptance test first failed against the workspace-only entry. It now passes along with six focused landing checks and all fifteen browser tests, including actual live build/correction/repair through the new homepage. A keyboard-focus regression was observed failing before focus management was added; entry now focuses the workspace main content at the top. Landing illustration changes and recorded-demo entry produce no API requests. The existing backend is unchanged.

Type checking, lint and production build pass. The workspace is split into a lazy chunk; the landing page adds no package dependencies. At 375, 768, 1024 and 1440 pixels, layouts have no horizontal page overflow and respect reduced-motion settings. Desktop and mobile screenshots were inspected. Axe 4.12.1 caught two low-contrast source labels; both were corrected. Final checked original, corrected and repaired states have zero violations. Overlapping SVG/inline-content checks remain incomplete in the automated contrast audit and were complemented with visual review.

A focused independent landing review found no introduced Critical, Important or Minor issues. It confirmed recorded entry, focus, top scrolling and browser Back behavior. A pre-existing workspace skip-link mode change remains outside this addition; the landing page has its own working skip link. Cloud deployment and broader SEO architecture remain outside the local landing scope. An unsupported label on the illustrative crossed-out value was replaced with explicit screen-reader text.

## Research-led landing redesign — October 15, 2026

The redesign follows the user-added deep-research and competitor-analysis skills. [Research and design direction](research/LANDING_REDESIGN.md) records primary sources, five relevant agent-memory products, the visual assessment and limits on competitive claims. The resulting graphite/mint page gives the dependency explorer its own wide workbench, with a concrete return-case comparison and recorded preservation evidence. The application backend and workspace routing are unchanged.

`UNDOGRAPH_LIVE_AI=1 npm run test:e2e` passes all sixteen tests without skips, including actual local build/correction/repair with Workers AI and FalkorDB. The responsive landing tests include all three illustration states at 320, 375, 768, 1024 and 1440 pixels. They check page overflow, clipped node labels, keyboard activation, local-only illustration/recorded entry and focus on workspace entry. Type checking, lint and the production build pass. No dependencies were added; the workspace, graph renderer and recorded data remain separate lazy chunks. The landing entry bundle is 247 kB / 76.74 kB gzip in this build.

Desktop/mobile screenshots were inspected, including 320-pixel reflow. Axe 4.12.1 reports zero violations for original, corrected and repaired states. Gradient/dot-background contrast checks remain incomplete; manual checks of the relevant text/accent pairs range from 6.17:1 to 11.27:1. The audit is bounded and does not establish universal accessibility compliance. Scans of tracked files and the browser build find no supplied GitHub tokens or local password/session secrets. Local server build configuration remains ignored and is not a public client asset.

Independent review caught an introduced skip-link contrast regression on first Tab. Its regression test failed with 1.11:1 contrast before the fix. A scoped foreground/background rule restores 11.26:1 contrast; the test also verifies visible keyboard focus and native navigation to the main content. The final eight-test landing rerun, type check, lint and build pass. The suite now contains seventeen browser tests. Review found no other introduced issues; the pre-existing recorded-workspace skip-link mode change remains outside this redesign.


## Custom workspaces — October 18, 2026

The domain-independent extension accepts bounded pasted document sources and explicitly scoped questions. Local verification passed 60 unit cases, TypeScript checks, lint and production client/Worker/gateway builds. Local workerd, integration and browser startup are blocked by this environment's `listen EPERM 127.0.0.1` restriction, and Docker is inaccessible. These are environment failures, not passing integration results. The feature branch runs the existing complete GitHub CI job against a real disposable FalkorDB.

New graph/API/Workflow cases cover project and research inputs, initialization identity and concurrent recovery, changed source text, stale-review refusal, exact independent preservation and the maximum 3-source/3-question build and repair. The gateway budget case makes every question select all three sources, corrects all sources, verifies six stale outputs and exercises corrected model JSON plus a repeated save. Provider responses in those tests come only from the explicitly test-only helper; inference quota reservation and graph behavior remain real.

Browser cases cover user-entered sources/questions, reload, source correction, audit export, missing-selection validation, mobile layout and cited source version navigation. The complete custom build/quote inspection/stale-review/repair/preservation browser case requires `UNDOGRAPH_LIVE_AI=1`, as does the existing retail live-inference check. CI skips these real-provider cases explicitly. This implementation has not yet been deployed or smoke-tested with real Workers AI; the earlier published verification applies to the retail scenario only.

# Verification record

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

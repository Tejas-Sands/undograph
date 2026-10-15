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

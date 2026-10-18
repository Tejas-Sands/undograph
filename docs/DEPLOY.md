# Local development and Cloudflare deployment

The verified targets include local development, the Railway container and the [public Cloudflare preview](https://undograph-preview.the-workflow-worker.workers.dev). The complete public live smoke passed on October 17, 2026 (IST); see [observed verification](VERIFICATION.md). For the selected deployment route, follow [Railway setup](RAILWAY.md): a co-located FalkorDB and authenticated HTTPS gateway connect to Cloudflare. The direct database TLS alternative below remains a separate supported configuration.

## Local application

Use Node.js 24, npm and Docker with Compose. From this repository:

```sh
npm ci
npm run setup:local
npm run db:up
npx wrangler login
npm run dev -- --host 127.0.0.1 --port 5173
```

Open `http://127.0.0.1:5173`. The official database image is pinned by digest in `compose.yaml`, requires the generated password and listens only on `127.0.0.1:16379`. The setup script creates ignored `.dev.vars` with mode 0600 and preserves existing values. Its named Docker volume persists graph data. `npm run db:stop` stops the container without deleting that data.

`npm ci` applies a narrow install-time fix to the pinned FalkorDB 6.8.0 SDK: it registers an error listener before connection establishment, allowing socket failures to reject rather than crash Node. If installing with lifecycle scripts disabled, run `node scripts/patch-falkordb.mjs` explicitly; the Dockerfile already does this. The script is idempotent and refuses an unexpected SDK version/layout. Remove or reassess it when upgrading the SDK.

Local Worker and Workflow execution uses workerd. Live generation uses the remote Workers AI binding and your Wrangler authentication. The model requested is `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, with temperature zero and at most 600 output tokens. There is one structured-output correction and at most one transient Workflow retry. Actual attempts reserve quota before inference.

For recorded-only exploration without Cloudflare authentication, use `UNDOGRAPH_OFFLINE=1 npm run dev` and open `/#/recorded/overview`. This disables remote bindings and never provides fake live inference. The local database is unnecessary for that read-only example, but is required for live APIs and graph integration tests.

The five-step fallback is at `/#/simulation/overview`, with a bottom-left entry and a contextual link on live failures. Its workspace, graph and captured evidence ship with the page so it remains usable after initial loading even if the network drops. Exports carry `origin: simulation` and `synthetic: true`.

## Checks

```sh
npm run typecheck
npm run lint
npm test
UNDOGRAPH_LIVE_AI=1 npm run test:e2e
npm run build
node scripts/cloud-smoke.mjs --base-url http://127.0.0.1:5173 --benchmark
```

`npm test` includes real FalkorDB tests using uniquely allocated disposable graphs. Missing database credentials produce explicit skips. Browser tests without `UNDOGRAPH_LIVE_AI=1` explicitly skip live inference; their recorded, dialog, correction-race and layout checks still run. CI provisions its own authenticated local database, disables remote bindings and does not claim to verify Workers AI.

The smoke command performs a real build, reload read, correction, multi-hop impact query, stale-review refusal, duplicate-run recovery, selective repair, internal review, foreign-visitor refusal and audit export. `--benchmark` adds a full build using the same corrected policy/case content. It reports measured calls, provider usage where available and persisted duration. Each created test visitor is isolated; completed test workspace graphs are deleted through an authenticated endpoint. Failure exits nonzero. An active or unreachable run can defer cleanup; registry expiry remains the fallback.

`--probe` performs only liveness, schema readiness and application-document checks. It does not verify inference, repair, certificate refusal or a Workflow. Use the full smoke for the application flow and `npm run probe:local` for the official SDK/runtime characterization tests.

## Cloud prerequisites

For Railway, use `GRAPH_GATEWAY_URL`, `GRAPH_GATEWAY_TOKEN` and `SESSION_SECRET` instead of the four direct database secrets. Follow [the complete Railway guide](RAILWAY.md) for persistent storage, HTTPS and verification.

Use an accessible FalkorDB endpoint with valid TLS certificates and graph permissions for the application-owned prefixes. Supply host, port, username and password separately, without embedding credentials in repository URLs or command arguments. A Cloudflare account must have Workers AI and Workflows available. Decide any infrastructure spend before provisioning services.

Wrangler configuration defines separate local, preview and production Worker names, Workflow names and graph prefixes. Preview uses `undograph_preview_`; production uses `undograph_production_`. Each environment has its own control graph. TLS is mandatory outside loopback local mode, with certificate validation enabled. Required schema must become operational before readiness passes.

## Preview

Authenticate with Wrangler in the intended account. If needed, set `CLOUDFLARE_ACCOUNT_ID` for account selection. Put the five server configuration values into preview secrets through Wrangler's interactive prompts:

```sh
npx wrangler secret put FALKORDB_HOST --env preview
npx wrangler secret put FALKORDB_PORT --env preview
npx wrangler secret put FALKORDB_USERNAME --env preview
npx wrangler secret put FALKORDB_PASSWORD --env preview
npx wrangler secret put SESSION_SECRET --env preview
npm run deploy:preview
```

Use a fresh random session secret of at least 32 bytes. Local `.dev.vars` is not a production credential source. Do not publish the server build directory or local secrets. Static assets come from `dist/client`; the browser has no database connection or AI credentials.

Run the full smoke against the returned preview URL. Verify API error sanitization, real graph paths inside Workflow steps, multi-hop impact, revision conflicts, source-version citations and preserved IDs/hashes. Also test refusal of wrong credentials and a real invalid-certificate endpoint before asserting the TLS runtime gate. The local plaintext test is not proof of deployed TLS behavior.

## Updating for custom workspaces

Deploy the updated Railway gateway first, then the Cloudflare Worker/assets. The Worker now uses the authenticated `logAttempt` gateway operation to reserve quota and record inference attempts in one round trip; an older gateway rejects it. The upgraded gateway also contains the new document/question validators and named configuration query. It remains compatible with the older Worker during the update. Existing Northstar workspaces retain their original build/correction flow; custom inputs start a fresh workspace generation.

After deployment, verify a custom project workspace with real Workers AI: build, correct the release date, inspect stale answers, repair and compare the independent owner answer's ID/hash. Repeat with research text, then check the original retail flow. CI verifies graph behavior with a test-only model and does not replace this deployed inference check.

The manual **verify public deployment** GitHub Actions workflow runs browser checks against the existing public URL with real Workers AI for both project and research inputs, then runs the original retail API smoke. It creates isolated visitors, checks quotations/citations, stale-review refusal and independent preservation, and deletes its owned terminal workspaces. Start it after the gateway and Worker update:

```sh
gh workflow run verify-public-deployment.yml --ref main
```

It uses the deployed app's existing AI/database quota, with no hosting secrets in GitHub. For a direct browser check, set `UNDOGRAPH_BASE_URL` and `UNDOGRAPH_LIVE_AI=1`; Playwright then targets that URL without starting a local Worker. The regular offline CI job continues to skip real inference.

## Production and rollback

Only deploy production after preview verification passes. Populate the same secret names with production-specific values using `--env production`, then run `npm run deploy:production`. Verify the returned `workers.dev` URL, `/#/sources`, `/#/recorded/overview`, health/readiness and the complete smoke. A custom domain is optional and requires an operator-supplied domain.

Before an update, retain the known-good deployment/version IDs from Wrangler. Use `npx wrangler deployments list --env production` to inspect deployments and `npx wrangler rollback --env production` to restore a known-good deployment after checking the CLI prompt and version. Database history is not rolled back by a Worker rollback; retain compatible graph contracts.

The control graph limits attempts to 24 per visitor hour and 400 globally per UTC day, plus 100 new workspaces per UTC day. A temporary inference stop can be applied by setting the current global-day quota to its cap through the operator's trusted database console. It prevents future reservations, including accepted asynchronous runs, while leaving recorded mode available. Never place administrative Cypher in a browser route.

The hourly scheduled handler removes only registry-confirmed expired visitor graphs matching that environment's exact server-generated format. It preserves live, unregistered, control and unrelated graphs. Workspace reset changes generation and invalidates old runs. The smoke cleanup endpoint refuses active runs and can delete only the authenticated visitor's terminal workspace.

References: [Cloudflare React/Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/), [AI bindings](https://developers.cloudflare.com/workers-ai/configuration/bindings/), [Workflows API](https://developers.cloudflare.com/workflows/build/workers-api/), [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/), [FalkorDB client](https://github.com/FalkorDB/falkordb-ts).

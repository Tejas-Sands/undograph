# Implementation decisions

## Repository and scope

The project root is `undograph/`; its public repository is <https://github.com/Tejas-Sands/undograph>. Sibling research and earlier prototypes are outside the project. Commits use Tejas-Sands as both author and committer. The README and preparation documents have separate commits.

## Local development first

The user selected local development before cloud deployment. Local runs use a password-protected official FalkorDB Docker image, pinned by digest and exposed only on loopback. `.dev.vars` is ignored, created with mode 0600, and never overwritten by repeated setup. No paid cloud service has been provisioned.

The official React/Workers TypeScript scaffold was generated with create-cloudflare 2.74.0. The implementation retains compatibility date `2026-10-15`, `nodejs_compat`, strict TypeScript, and separate local/preview/production graph prefixes.

The current official Workers testing integration is `@cloudflare/vitest-plugin`; it replaces the older pool-specific setup in earlier examples. Tests execute in workerd, and the database tests use the actual official `falkordb` SDK against the local container. See [Cloudflare's testing guide](https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/) and [the official FalkorDB client](https://github.com/FalkorDB/falkordb-ts).

## Connection lifecycle

Database sockets are created per invocation, named after the server-selected graph, and closed in `finally`. Connections have a five-second timeout, automatic reconnect is disabled, command waits are bounded, and graph operations use server query timeouts. TLS validates certificates; plaintext connections are accepted only for loopback hosts in local mode. HTTP errors never include the original database error, host, or password.

## Vite dependency resolution

The initial running-server check failed with `TypeError: e.BigInt is not a function`. Vite 8 optimized the graph SDK's CommonJS Temporal dependency against JSBI's ESM namespace, while that dependency expects the CommonJS export. Native Node imports and the Workers test integration already worked. Vite now resolves JSBI through Node's public CommonJS resolver. This uses the existing dependency and fixes the actual server startup; it does not replace or fork the graph client. The local HTTP smoke check failed before this change and passed afterward.

## Gates that remain

Local work does not establish deployed Workers compatibility. A public service still requires a reachable TLS-enabled FalkorDB endpoint, rejection of an invalid certificate against a real TLS endpoint, and the deployed Worker/Workflow probe. The operations UI and browser acceptance remain before the local application is complete.

Readiness verifies operational application constraints and indexes alongside a database query. No in-memory application database or silent inference fallback is used.

## Versioned graph storage

Artifacts and dependency links are written together in one guarded, parameterized mutation. Native uniqueness constraints protect IDs and the optional `currentKey` pointer; immutable hashes protect repeated writes. Candidates have no current pointer. Required schema must be operational before readiness succeeds.

Repair planning includes all current stale work, including pending work from earlier corrections. Assessments take explicit case and facts version references; those IDs cannot be inferred from policy content. Audits reject cycles, missing links and excessive depth. Explanation responses have a 1,024-path ceiling and explicitly fail as incomplete when exceeded.

## Durable live builds

Workers AI receives only recorded source/case/assessment inputs. Policy quotations must match one unambiguous numerical statement. The server derives character offsets from the exact quotation and rejects conflicting offsets if supplied. Eligibility remains application code. Replies must agree with that decision and cite supplied input versions; operator review is always required.

Each model result and provider usage are checkpointed separately from database persistence. Persistence retries reuse the validated response and stable artifact ID. The graph records supplied reads before inference, actual attempt counts, six output steps and two role sessions. Builds publish the complete candidate set in one guarded mutation. Failed candidates stay inspectable and unpublished.

Model generation uses temperature zero, 600 output tokens, one structured-output correction, and at most one transient Workflow retry after three seconds with a sixty-second attempt timeout. Authorization, validation and quota failures are fatal. Unknown token measurements remain absent. Live failure has no recorded-data fallback.

Signed visitor cookies and inference quota reservations were brought forward from the isolation milestone because live APIs need bounded, owned execution immediately. Native graph mutations enforce limits of 24 attempts per visitor hour, 400 globally per UTC day, and 100 workspace allocations per day. Full cleanup, reset and export remain later work.

## Source correction and selective repair

A correction versions only the synthetic return-window field and requires an operator reason. It atomically invalidates pending descendants, flags released history and makes an active older run obsolete. A repair persists its graph-derived plan and stages replacements with exact version mapping. Final promotion verifies the complete set, source revision and preserved ID/hash pairs. Consecutive corrections still repair all earlier pending stale work. Released historical replies require review and are not regenerated as external actions.

A real inference response exposed an overly strict punctuation check: a supporting quotation contained the complete numerical statement without its terminal period. The validator now accepts that exact substring while retaining exact offsets, the complete statement, unique source evidence and the matching numerical window. Regression checks still reject fabricated or unsupported quotations. Returned usage from rejected structured responses is checkpointed and saved separately before the run is marked failed.

## Visitor lifecycle and public bounds

The existing `identity.ts` keeps cookie verification and keyed graph naming together rather than adding wrapper modules. New cookies sign a visitor ID, workspace generation and expiry. Initial development cookies still recover their original graph. Reset changes the generation while preserving the visitor identity and expiry, so it does not reset inference quotas. It closes the old workspace, increments its revision and marks its active run obsolete before returning the new cookie. A client that lost the response can create a fresh generation from its closed previous workspace.

API launch checks known quota exhaustion before saving a new run. The authoritative reservation remains an atomic graph mutation before every provider call, including correction attempts and retries. A concurrent quota race can therefore fail an accepted asynchronous run visibly without making an unreserved model call.

Hourly scheduled cleanup selects expired registry entries and accepts only the configured prefix plus the exact server-generated visitor-graph format. It preserves live graphs, unregistered graphs, control graphs and unrelated names. An export contains validated synthetic snapshot records, impact paths and measured run state, without cookies, graph names or connection configuration. Reset requires the explicit `RESET` confirmation field; draft review never sends externally.

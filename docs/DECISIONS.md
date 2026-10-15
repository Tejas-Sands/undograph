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

Local work does not establish deployed Workers compatibility. A public service still requires a reachable TLS-enabled FalkorDB endpoint, rejection of an invalid certificate against a real TLS endpoint, and the deployed Worker/Workflow probe. The full application also needs agent execution, repair, isolation, and browser acceptance checks before it can be presented as working.

Readiness verifies operational application constraints and indexes alongside a database query. No in-memory application database or silent inference fallback is used.

## Versioned graph storage

Artifacts and dependency links are written together in one guarded, parameterized mutation. Native uniqueness constraints protect IDs and the optional `currentKey` pointer; immutable hashes protect repeated writes. Candidates have no current pointer. Required schema must be operational before readiness succeeds.

Repair planning includes all current stale work, including pending work from earlier corrections. Assessments take explicit case and facts version references; those IDs cannot be inferred from policy content. Audits reject cycles, missing links and excessive depth. Explanation responses have a 1,024-path ceiling and explicitly fail as incomplete when exceeded.

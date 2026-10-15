# UndoGraph

UndoGraph repairs an agent's stored context and pending work after an operator corrects a source. FalkorDB records the input dependencies that determine which artifacts become stale and which work must run again.

The proposed first demo is a fictional customer-support workspace. Correct a return window from 30 days to 14 days, inspect affected work from two agent sessions, regenerate pending replies, and verify that an unrelated password-reset reply retains its original version and content.

## Project documents

- [Product and technical specification](DESIGN.md)
- [Implementation plan](IMPLEMENTATION_PLAN.md)

Target deployment: a React application and API on Cloudflare Workers, durable runs on Cloudflare Workflows, inference on Workers AI, and an external FalkorDB instance. FalkorDB remains the canonical application database.

## Current status

Local runtime development has started: the React/Workers project, health and database-readiness API, and a password-protected FalkorDB container are implemented. Agent execution, graph-driven repair, and the operations workspace are the next milestones. Cloud deployment is pending a TLS-enabled database endpoint and deployed verification.

## Local development

Requires Node.js 24 and Docker with Compose. Run commands from this directory:

```sh
npm ci
npm run setup:local
npm run db:up
npm run dev
```

The setup command creates ignored `.dev.vars` with fresh local secrets and preserves it on subsequent runs. FalkorDB is exposed only at `127.0.0.1:16379`; its named Docker volume persists data. `npm run db:stop` stops the container without deleting data.

```sh
npm run typecheck
npm test
npm run build
```

`npm run probe:local` exercises the official database client inside workerd, including parameterized writes, a three-hop graph path, authentication refusal, connection cleanup, and a real local Workflow step. Graph tests use disposable, uniquely named graphs and report skips when database credentials are absent.

`GET /api/health` tests Worker liveness. `GET /api/ready` performs a real database query and returns a sanitized 503 when unavailable. Artifact-schema readiness will be added with the versioned graph store.

The Graph Hacks event starts October 15, 2026 at 12:01 AM IST and closes October 18 at 11:59 PM IST. Its rules permit preparation notes beforehand and require the main coding and design work to start during the event. This application must be implemented as new work during that window. [Official rules](https://www.wemakedevs.org/hackathons/falkordb/rules)

## Intended result

A publicly accessible Cloudflare demo with synthetic data, isolated visitor workspaces, actual recorded agent runs, inspectable dependency paths, recoverable failures, and a reproducible comparison before and after repair. Recorded examples may provide an explicitly labeled read-only walkthrough; they must never be presented as live inference.

Primary track: Agent Memory and Coordination. Secondary track: Agents That Act on Connected Data, provided the final implementation demonstrates graph-driven repair actions.

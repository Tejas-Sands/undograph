# Graph storage

Each visitor workspace uses a separate, server-selected FalkorDB graph. `Workspace` stores its revision. `Artifact` stores immutable JSON, content/dependency SHA-256 hashes, logical identity, version, recorded input IDs and publication state. Other application labels are `Agent`, `Session`, `Run`, `Step`, `Change` and `RepairReport`; their records are populated by later execution milestones. A `Schema` marker records initialization.

Every application label has a native unique `id` constraint with a backing range index. `Artifact.currentKey` is also unique: only a current version holds its logical ID there. Historical and candidate versions omit it. Additional indexes cover artifact logical IDs and run status. Initialization waits for required indexes and constraints to become operational.

`(output)-[:DEPENDS_ON]->(input)` records the exact versions supplied to computation. `(new)-[:SUPERSEDES]->(old)` records version history. Explanation paths reverse dependency edges for human reading, from source through derived work. Seed initialization creates five source/case inputs and two agent definitions, without generated outputs or dependency edges.

## Queries

The fixed query registry is `worker/graph/queries.ts`; browser input never becomes Cypher text. All variable values use named parameters. `recordArtifact` checks workspace revision, capacity, current-version pointer, immutable identity, predecessor and parent freshness inside the same mutation that stores content and creates dependencies. Repeating the same artifact ID with the same content and inputs returns the original version; changed immutable content is rejected.

`snapshot` reads labeled nodes and outgoing edges in one graph query. `impact` follows reverse `DEPENDS_ON` paths from the selected source, bounded to twelve hops. It guards the revision and artifact count read for validation, includes current descendants and released history, deduplicates affected artifacts, and retains distinct explanation paths. A fan-in reply appears once in the affected set with each dependency path available.

## Completeness limits

A workspace contains at most 250 artifact versions, with dependency depth at most twelve. Every audit validates stored input IDs against actual dependency edges, checks current-version uniqueness, missing artifacts and cycles. The traversal requests at most 1,025 paths so it can detect exceeding the supported 1,024 explanations. Exceeding a limit or encountering corrupt lineage raises `INCOMPLETE_AUDIT`; a truncated result is never labeled complete.

Repair planning orders current stale derived artifacts by their recorded dependencies. Source replacements follow exact `SUPERSEDES` version IDs. Independent current work is returned with its original ID and content hash for subsequent preservation checks. Source correction and atomic candidate promotion are implemented in the repair milestone.

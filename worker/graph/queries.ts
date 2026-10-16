import type { JsonValue } from '../../shared/contracts'
import { runQueries } from './run-queries'
import { repairQueries } from './repair-queries'
import { sessionQueries } from './session-queries'

export type QueryParams = Record<string, JsonValue>

export const queries = {
  health: 'RETURN 1 AS ok',
  ...runQueries,
  ...repairQueries,
  ...sessionQueries,
  bootstrapWorkspace: `OPTIONAL MATCH (existing:Workspace)
    WITH existing WHERE existing IS NULL OR existing.id = $id
    MERGE (w:Workspace {id: $id})
    ON CREATE SET w.revision = 0, w.createdAt = $createdAt, w.expiresAt = $expiresAt, w.initialized = false
    RETURN properties(w) AS workspace`,
  seedAgent: `MERGE (a:Agent {id: $id}) ON CREATE SET a.role = $role RETURN a.id AS id`,
  finishInitialization: `MATCH (w:Workspace {id: $id}) WHERE w.revision = 0
    SET w.initialized = true RETURN w.id AS id`,
  snapshot: `MATCH (n) OPTIONAL MATCH (n)-[r]->(target)
    RETURN labels(n) AS labels, properties(n) AS node, type(r) AS relation, target.id AS targetId`,
  recordArtifact: `MATCH (w:Workspace) WHERE w.revision = $expectedRevision
    OPTIONAL MATCH (existing:Artifact {id: $id})
    WITH w, existing WHERE existing IS NULL OR
      (existing.logicalId = $logicalId AND existing.kind = $kind AND
       existing.contentHash = $contentHash AND existing.dependencyHash = $dependencyHash)
    OPTIONAL MATCH (allArtifacts:Artifact)
    WITH w, existing, count(allArtifacts) AS total
    WHERE existing IS NOT NULL OR total < 250
    OPTIONAL MATCH (current:Artifact {currentKey: $logicalId})
    WITH w, existing WHERE existing IS NOT NULL OR $status = 'candidate' OR current IS NULL
    OPTIONAL MATCH (previous:Artifact {id: $supersedesId})
    WITH w, existing, previous WHERE $supersedesId IS NULL OR existing IS NOT NULL OR
      (previous.logicalId = $logicalId AND previous.kind = $kind AND previous.isCurrent = true)
    OPTIONAL MATCH (version:Artifact {logicalId: $logicalId})
    WITH w, existing, previous, coalesce(max(version.version), 0) + 1 AS nextVersion
    OPTIONAL MATCH (parent:Artifact) WHERE parent.id IN $inputIds
    WITH w, existing, previous, nextVersion, collect(parent) AS parents
    WHERE size(parents) = size($inputIds) AND all(parent IN parents WHERE
      (parent.isCurrent = true AND parent.needsReview = false AND parent.status IN ['current', 'released']) OR
      ($status = 'candidate' AND parent.status = 'candidate' AND parent.runId = $runId))
    MERGE (a:Artifact {id: $id}) ON CREATE SET
      a.logicalId = $logicalId, a.version = nextVersion, a.kind = $kind, a.bodyJson = $bodyJson,
      a.contentHash = $contentHash, a.dependencyHash = $dependencyHash, a.inputIdsJson = $inputIdsJson,
      a.depth = $depth, a.status = $status, a.isCurrent = $isCurrent, a.needsReview = $needsReview,
      a.currentKey = CASE WHEN $isCurrent THEN $logicalId ELSE null END,
      a.createdAt = $createdAt, a.stage = $stage, a.promptVersion = $promptVersion,
      a.runId = $runId, a.stepId = $stepId, a.sessionId = $sessionId
    FOREACH (parent IN parents | MERGE (a)-[:DEPENDS_ON]->(parent))
    FOREACH (prior IN CASE WHEN previous IS NULL THEN [] ELSE [previous] END | MERGE (a)-[:SUPERSEDES]->(prior))
    RETURN properties(a) AS artifact`,
  impact: `MATCH (w:Workspace) OPTIONAL MATCH (a:Artifact)
    WITH w, count(a) AS artifactCount
    WHERE w.revision = $expectedRevision AND artifactCount = $artifactCount
    MATCH (source:Artifact {id: $sourceId})
    OPTIONAL MATCH p=(derived:Artifact)-[:DEPENDS_ON*1..12]->(source)
    WHERE derived.isCurrent = true OR derived.status = 'released'
    RETURN w.revision AS revision, properties(derived) AS artifact,
      CASE WHEN p IS NULL THEN [] ELSE [node IN nodes(p) | node.id] END AS path
    LIMIT 1025`,
} as const

export type QueryName = keyof typeof queries
export const readOnlyQueries = new Set<QueryName>(['health', 'snapshot', 'impact', 'runPlan', 'expiredWorkspaces', 'inferenceAvailable', 'workspaceRegistration'])

export const runQueries = {
  prepareRun: `MATCH (w:Workspace) WHERE w.revision = $revision AND w.activeRunId IS NULL
    MERGE (r:Run {id: $id}) ON CREATE SET r.type = $type, r.status = 'queued',
      r.baseRevision = $revision, r.requestHash = $requestHash, r.createdAt = $now,
      r.modelCalls = 0, r.origin = 'live', r.sourceArtifactId = $sourceArtifactId
    SET w.activeRunId = r.id RETURN r.id AS id`,
  beginRun: `MATCH (w:Workspace), (r:Run {id: $id})
    WHERE w.revision = r.baseRevision AND w.activeRunId = r.id AND r.status IN ['queued', 'running']
    SET r.status = 'running'
    MERGE (analyst:Session {id: $analystSession}) ON CREATE SET analyst.createdAt = $now, analyst.label = 'Policy analysis'
    MERGE (reply:Session {id: $replySession}) ON CREATE SET reply.createdAt = $now, reply.label = 'Reply drafting'
    MERGE (r)-[:IN_SESSION]->(analyst) MERGE (r)-[:IN_SESSION]->(reply)
    RETURN r.id AS id`,
  createStep: `MATCH (w:Workspace), (r:Run {id: $runId}), (agent:Agent {role: $role}), (session:Session {id: $sessionId})
    WHERE w.revision = r.baseRevision AND w.activeRunId = r.id AND r.status = 'running'
    MERGE (s:Step {id: $id}) ON CREATE SET s.runId = $runId, s.stage = $stage,
      s.status = 'running', s.attempts = 0, s.startedAt = $now
    MERGE (r)-[:HAS_STEP]->(s) MERGE (s)-[:EXECUTED_BY]->(agent) MERGE (s)-[:IN_SESSION]->(session)
    RETURN s.id AS id`,
  readInputs: `MATCH (w:Workspace), (s:Step {id: $stepId}), (r:Run {id: s.runId})
    WHERE w.revision = r.baseRevision AND w.activeRunId = r.id AND r.status = 'running'
    OPTIONAL MATCH (a:Artifact) WHERE a.id IN $inputIds
    WITH s, r, collect(a) AS inputs WHERE size(inputs) = size($inputIds) AND all(a IN inputs WHERE
      (a.isCurrent = true AND a.status IN ['current', 'released'] AND a.needsReview = false) OR
      (a.status = 'candidate' AND a.runId = r.id))
    FOREACH (a IN inputs | MERGE (s)-[:READ]->(a)) RETURN s.id AS id`,
  recordAttempt: `MATCH (w:Workspace), (r:Run {id: $runId}), (s:Step {id: $stepId})
    WHERE w.revision = r.baseRevision AND w.activeRunId = r.id AND r.status = 'running' AND s.runId = r.id
    SET r.modelCalls = r.modelCalls + 1, s.attempts = s.attempts + 1 RETURN s.attempts AS attempts`,
  completeStep: `MATCH (s:Step {id: $stepId}), (a:Artifact {id: $artifactId}), (session:Session {id: a.sessionId})
    WHERE s.runId = a.runId SET s.status = 'succeeded', s.completedAt = $now,
      s.inputTokens = $inputTokens, s.outputTokens = $outputTokens
    MERGE (s)-[:PRODUCED]->(a) MERGE (a)-[:IN_SESSION]->(session) RETURN s.id AS id`,
  promoteRun: `MATCH (w:Workspace), (r:Run {id: $runId})
    WHERE w.revision = $revision AND r.baseRevision = $revision AND w.activeRunId = r.id AND r.status = 'running'
    MATCH (candidate:Artifact) WHERE candidate.runId = r.id AND candidate.status = 'candidate'
    WITH w, r, collect(candidate) AS candidates WHERE size(candidates) = $count
    UNWIND candidates AS a OPTIONAL MATCH (a)-[:DEPENDS_ON]->(parent:Artifact)
    WITH w, r, candidates, collect(parent) AS parents
    WHERE all(parent IN parents WHERE parent IN candidates OR (parent.isCurrent = true AND parent.status IN ['current', 'released'] AND parent.needsReview = false))
    UNWIND candidates AS a OPTIONAL MATCH (old:Artifact) WHERE old.currentKey = a.logicalId
    WITH w, r, candidates, collect(old) AS previous
    FOREACH (old IN previous | SET old.isCurrent = false, old.currentKey = null,
      old.status = CASE WHEN old.status = 'released' THEN 'released' ELSE 'superseded' END)
    FOREACH (a IN candidates | SET a.status = 'current', a.isCurrent = true, a.currentKey = a.logicalId)
    SET r.status = 'succeeded', r.completedAt = $now, w.activeRunId = null RETURN r.id AS id`,
  failRun: `MATCH (w:Workspace), (r:Run {id: $runId})
    WHERE r.status IN ['queued', 'running']
    SET r.status = CASE WHEN w.revision <> r.baseRevision THEN 'obsolete' ELSE 'failed' END,
      r.errorCode = CASE WHEN w.revision <> r.baseRevision THEN 'REVISION_CONFLICT' ELSE $errorCode END,
      r.completedAt = $now, w.activeRunId = CASE WHEN w.activeRunId = r.id THEN null ELSE w.activeRunId END
    WITH r OPTIONAL MATCH (r)-[:HAS_STEP]->(s:Step) WHERE s.status = 'running'
    SET s.status = 'failed', s.completedAt = $now RETURN r.id AS id`,
  reserveInference: `MERGE (visitor:Quota {id: $visitorBucket}) ON CREATE SET visitor.count = 0, visitor.expiresAt = $hourExpiry
    MERGE (global:Quota {id: $globalBucket}) ON CREATE SET global.count = 0, global.expiresAt = $dayExpiry
    WITH visitor, global WHERE visitor.count < 24 AND global.count < 400
    SET visitor.count = visitor.count + 1, global.count = global.count + 1 RETURN visitor.count AS count`,
  registerWorkspace: `MERGE (quota:Quota {id: $dayBucket}) ON CREATE SET quota.count = 0, quota.expiresAt = $dayExpiry
    WITH quota OPTIONAL MATCH (existing:WorkspaceRegistry {id: $graphName})
    WITH quota, existing WHERE existing IS NOT NULL OR quota.count < 100
    FOREACH (unused IN CASE WHEN existing IS NULL THEN [1] ELSE [] END | SET quota.count = quota.count + 1)
    MERGE (registry:WorkspaceRegistry {id: $graphName}) ON CREATE SET registry.expiresAt = $expiresAt
    RETURN registry.id AS id`,
} as const

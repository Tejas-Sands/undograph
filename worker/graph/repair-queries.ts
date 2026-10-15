export const repairQueries = {
  commitCorrection: `MATCH (w:Workspace) WHERE w.revision = $revision
    OPTIONAL MATCH (a:Artifact) WITH w, count(a) AS total WHERE total = $artifactCount AND total < 250
    MATCH (old:Artifact {id: $oldId}) WHERE old.isCurrent = true AND old.currentKey = $logicalId AND old.kind = 'source'
    OPTIONAL MATCH (affected:Artifact) WHERE affected.id IN $affectedIds
    WITH w, old, collect(affected) AS affected WHERE size(affected) = size($affectedIds)
    SET old.isCurrent = false, old.currentKey = null, old.status = 'superseded'
    CREATE (source:Artifact {id: $id, logicalId: $logicalId, version: old.version + 1, kind: 'source',
      bodyJson: $bodyJson, contentHash: $contentHash, dependencyHash: $dependencyHash,
      inputIdsJson: '[]', depth: 0, status: 'current', isCurrent: true, needsReview: false,
      currentKey: $logicalId, createdAt: $now, stage: 'operator-correction', promptVersion: 'v1'})
    CREATE (change:Change {id: $changeId, oldSourceId: old.id, newSourceId: source.id, reason: $reason, createdAt: $now, revision: $revision + 1})
    MERGE (source)-[:SUPERSEDES]->(old) MERGE (change)-[:REPLACES]->(old) MERGE (change)-[:INTRODUCES]->(source)
    FOREACH (a IN affected | SET a.status = CASE WHEN a.status = 'released' THEN 'released' ELSE 'stale' END,
      a.needsReview = CASE WHEN a.status = 'released' THEN true ELSE a.needsReview END)
    WITH w, change OPTIONAL MATCH (active:Run {id: w.activeRunId})
    SET active.status = 'obsolete', active.errorCode = 'REVISION_CONFLICT', active.completedAt = $now,
      w.revision = $revision + 1, w.activeRunId = null RETURN change.id AS id`,
  runPlan: `MATCH (r:Run {id: $id}) RETURN r.planJson AS json`,
  promoteRepair: `MATCH (w:Workspace), (r:Run {id: $runId})
    WHERE w.revision = $revision AND r.baseRevision = $revision AND w.activeRunId = r.id AND r.status = 'running'
    MATCH (candidate:Artifact)-[:SUPERSEDES]->(old:Artifact)
    WHERE candidate.id IN $candidateIds AND candidate.runId = r.id AND candidate.status = 'candidate'
      AND old.id IN $oldIds AND old.isCurrent = true AND old.status = 'stale'
    WITH w, r, collect(DISTINCT candidate) AS candidates, collect(DISTINCT old) AS previous
    WHERE size(candidates) = size($candidateIds) AND size(previous) = size($oldIds)
    UNWIND candidates AS candidate OPTIONAL MATCH (candidate)-[:DEPENDS_ON]->(parent:Artifact)
    WITH w, r, candidates, previous, collect(parent) AS parents
    WHERE all(parent IN parents WHERE parent IN candidates OR
      (parent.isCurrent = true AND parent.status IN ['current', 'released'] AND parent.needsReview = false))
    OPTIONAL MATCH (preserved:Artifact) WHERE preserved.id IN $preservedIds
    WITH w, r, candidates, previous, collect(preserved) AS preserved
    WHERE size(preserved) = size($preservedIds) AND all(pair IN $preservedPairs WHERE
      any(a IN preserved WHERE a.id = pair[0] AND a.contentHash = pair[1] AND a.isCurrent = true))
    FOREACH (old IN previous | SET old.isCurrent = false, old.currentKey = null, old.status = 'superseded')
    FOREACH (candidate IN candidates | SET candidate.isCurrent = true, candidate.currentKey = candidate.logicalId, candidate.status = 'current')
    MERGE (report:RepairReport {id: $reportId}) ON CREATE SET report.runId = r.id,
      report.revision = $revision, report.createdAt = $now, report.repairedLogicalIdsJson = $logicalIdsJson, report.preservedJson = $preservedJson
    SET r.status = 'succeeded', r.completedAt = $now, w.activeRunId = null RETURN report.id AS id`,
  releaseDraft: `MATCH (w:Workspace), (reply:Artifact {id: $id})
    WHERE w.revision = $revision AND reply.kind = 'reply' AND reply.isCurrent = true
      AND reply.status IN ['current', 'released'] AND reply.needsReview = false
    OPTIONAL MATCH (reply)-[:DEPENDS_ON*1..12]->(ancestor:Artifact)
    WITH reply, collect(DISTINCT ancestor) AS ancestors
    WHERE all(a IN ancestors WHERE a.isCurrent = true AND a.status IN ['current', 'released'] AND a.needsReview = false)
    SET reply.status = 'released' RETURN reply.id AS id`,
} as const

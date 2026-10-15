export const sessionQueries = {
  workspaceRegistration: `MATCH (r:WorkspaceRegistry {id:$id}) RETURN r.expiresAt AS expiresAt`,
  closeWorkspace: `MATCH (w:Workspace) WHERE w.revision = $revision AND w.activeRunId IS NULL
    SET w.expiresAt = $now, w.revision = w.revision + 1 RETURN w.id AS id`,
  expiredWorkspaces: `MATCH (r:WorkspaceRegistry) WHERE r.expiresAt <= $now RETURN r.id AS id`,
  removeRegistry: `MATCH (r:WorkspaceRegistry {id: $id}) WHERE r.expiresAt <= $now DELETE r`,
  expireRegistry: `MATCH (r:WorkspaceRegistry {id: $id}) SET r.expiresAt = $now`,
  cleanupQuotas: `MATCH (q:Quota) WHERE q.expiresAt <= $now DELETE q`,
  expireWorkspace: `MATCH (w:Workspace) OPTIONAL MATCH (r:Run {id:w.activeRunId})
    SET w.expiresAt = $now, w.revision = w.revision + 1, w.activeRunId = null,
      r.status = 'obsolete', r.errorCode = 'WORKSPACE_RESET', r.completedAt = $now RETURN w.id AS id`,
  createSession: `MATCH (w:Workspace) WHERE w.expiresAt > $now
    OPTIONAL MATCH (existing:Session) WITH w, count(existing) AS total WHERE total < 100
    CREATE (s:Session {id:$id, label:$label, createdAt:$now}) RETURN s.id AS id`,
  inferenceAvailable: `OPTIONAL MATCH (visitor:Quota {id:$visitorBucket})
    OPTIONAL MATCH (global:Quota {id:$globalBucket}) RETURN coalesce(visitor.count,0) AS visitor, coalesce(global.count,0) AS global`,
} as const

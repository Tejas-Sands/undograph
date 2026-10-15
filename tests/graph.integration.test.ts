import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sourceBodySchema, type ArtifactWrite } from '../shared/contracts'
import type { Env } from '../worker/env'
import { withGraph } from '../worker/graph/client'
import { findImpact, initializeWorkspace, loadSnapshot, recordArtifact } from '../worker/graph/store'
import { supportWork } from './helpers/support-work'

const bindings = env as unknown as Env
const configured = Boolean(bindings.FALKORDB_HOST && bindings.FALKORDB_PASSWORD)
let graphName: string

describe.skipIf(!configured)('versioned artifact storage in real FalkorDB', () => {
  beforeEach(async () => {
    graphName = `undograph_test_integration_${crypto.randomUUID().replaceAll('-', '')}`
    await initializeWorkspace(bindings, graphName, 'workspace', Date.now() + 86_400_000)
  })

  afterEach(async () => {
    if (!graphName) return
    try {
      await withGraph(bindings, graphName, (graph) => graph.delete())
    } catch (error) {
      if (!(error instanceof Error) || !/empty key|not exist|unknown graph/i.test(error.message)) throw error
    }
  })

  it('initializes only synthetic input artifacts and agents and recovers the same workspace', async () => {
    const first = await loadSnapshot(bindings, graphName)
    expect(first.artifacts).toHaveLength(5)
    expect(first.artifacts.every((artifact) => ['source', 'case'].includes(artifact.kind))).toBe(true)
    expect(first.edges.filter((edge) => edge.type === 'DEPENDS_ON')).toEqual([])
    expect(first.agents.map((agent) => agent.role).sort()).toEqual(['policy-analyst', 'reply-agent'])
    const recovered = await initializeWorkspace(bindings, graphName, 'workspace', Date.now() + 86_400_000)
    expect(recovered.artifacts.map((artifact) => [artifact.id, artifact.contentHash])).toEqual(first.artifacts.map((artifact) => [artifact.id, artifact.contentHash]))
  })

  it('makes repeated writes idempotent and refuses rewriting immutable content', async () => {
    const original = (await loadSnapshot(bindings, graphName)).artifacts.find((artifact) => artifact.id === 'source_return_policy_v1')!
    const write: ArtifactWrite = {
      id: original.id, logicalId: original.logicalId, kind: 'source', body: original.body,
      inputIds: [], expectedRevision: 0, stage: 'seed', promptVersion: 'v1',
    }
    expect((await recordArtifact(bindings, graphName, write)).contentHash).toBe(original.contentHash)
    await expect(recordArtifact(bindings, graphName, {
      ...write, body: { ...sourceBodySchema.parse(original.body), text: 'A changed source cannot rewrite an immutable version.' },
    })).rejects.toMatchObject({ code: 'ARTIFACT_CONFLICT' })
    expect((await loadSnapshot(bindings, graphName)).artifacts.find((artifact) => artifact.id === original.id)?.contentHash).toBe(original.contentHash)
  })

  it('keeps candidate versions separate from current source pointers', async () => {
    const original = (await loadSnapshot(bindings, graphName)).artifacts.find((artifact) => artifact.id === 'source_return_policy_v1')!
    const candidate = await recordArtifact(bindings, graphName, {
      id: 'source_candidate_v2', logicalId: original.logicalId, kind: 'source',
      body: { ...sourceBodySchema.parse(original.body), text: sourceBodySchema.parse(original.body).text.replace('30 days', '14 days') },
      inputIds: [], status: 'candidate', supersedesId: original.id, expectedRevision: 0, stage: 'test-candidate', promptVersion: 'v1',
    })
    expect(candidate.version).toBe(2)
    expect(candidate.isCurrent).toBe(false)
    const snapshot = await loadSnapshot(bindings, graphName)
    expect(snapshot.artifacts.find((artifact) => artifact.id === original.id)?.isCurrent).toBe(true)
    expect(snapshot.edges).toContainEqual({ from: candidate.id, to: original.id, type: 'SUPERSEDES' })
  })

  it('finds exactly five affected return artifacts while preserving the independent password reply', async () => {
    await supportWork(bindings, graphName)
    const before = (await loadSnapshot(bindings, graphName)).artifacts.find((artifact) => artifact.id === 'reply_A001_v1')!
    const impact = await findImpact(bindings, graphName, 'source_return_policy_v1')
    expect(impact.complete).toBe(true)
    expect(impact.affected.map((artifact) => artifact.id).sort()).toEqual(['assessment_R007_v1', 'assessment_R021_v1', 'facts_v1', 'reply_R007_v1', 'reply_R021_v1'])
    expect(impact.paths).toContainEqual(['source_return_policy_v1', 'facts_v1', 'assessment_R021_v1', 'reply_R021_v1'])
    expect(impact.paths).toContainEqual(['source_return_policy_v1', 'reply_R021_v1'])
    const after = (await loadSnapshot(bindings, graphName)).artifacts.find((artifact) => artifact.id === before.id)!
    expect([after.id, after.contentHash, after.body]).toEqual([before.id, before.contentHash, before.body])
  })

  it('deduplicates a shared descendant and keeps both explanation paths', async () => {
    await supportWork(bindings, graphName)
    const impact = await findImpact(bindings, graphName, 'source_return_policy_v1')
    expect(impact.affected.filter((artifact) => artifact.id === 'reply_R021_v1')).toHaveLength(1)
    expect(impact.paths.filter((path) => path.at(-1) === 'reply_R021_v1')).toHaveLength(2)
  })

  it('returns not found for an unknown or foreign source ID', async () => {
    await expect(findImpact(bindings, graphName, 'foreign_source')).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
  })

  it('reports no affected work before any agent has read a source', async () => {
    const impact = await findImpact(bindings, graphName, 'source_return_policy_v1')
    expect(impact.affected).toEqual([])
    expect(impact.paths).toEqual([])
    expect(impact.complete).toBe(true)
  })

  it('allows only one current version when first writes race for the same logical artifact', async () => {
    const base = {
      logicalId: 'source:shared', kind: 'source' as const,
      body: { title: 'Shared source', category: 'account-help', text: 'Synthetic shared source.' },
      inputIds: [], expectedRevision: 0, stage: 'seed', promptVersion: 'v1',
    }
    const results = await Promise.allSettled([
      recordArtifact(bindings, graphName, { ...base, id: 'concurrent_one' }),
      recordArtifact(bindings, graphName, { ...base, id: 'concurrent_two' }),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    const snapshot = await loadSnapshot(bindings, graphName)
    expect(snapshot.artifacts).toHaveLength(6)
    expect(snapshot.artifacts.filter((artifact) => artifact.logicalId === 'source:shared' && artifact.isCurrent)).toHaveLength(1)
  })

  it('rejects a conflicting revision without writing an artifact', async () => {
    await expect(recordArtifact(bindings, graphName, {
      id: 'wrong_revision', logicalId: 'source:extra', kind: 'source',
      body: { title: 'Extra source', category: 'account-help', text: 'Synthetic information.' },
      inputIds: [], expectedRevision: 99, stage: 'seed', promptVersion: 'v1',
    })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    expect((await loadSnapshot(bindings, graphName)).artifacts).toHaveLength(5)
  })

  it('enforces unique artifact IDs at the database boundary', async () => {
    await expect(withGraph(bindings, graphName, (graph) => graph.query('CREATE (:Artifact {id: $id})', {
      params: { id: 'source_return_policy_v1' }, TIMEOUT: 2_000,
    }))).rejects.toThrow()
    expect((await loadSnapshot(bindings, graphName)).artifacts).toHaveLength(5)
  })

  it('reports an incomplete audit for a corrupt dependency cycle', async () => {
    await supportWork(bindings, graphName)
    await withGraph(bindings, graphName, (graph) => graph.query(`
      MATCH (facts:Artifact {id: $facts}), (reply:Artifact {id: $reply})
      MERGE (facts)-[:DEPENDS_ON]->(reply) SET facts.inputIdsJson = $inputs`, {
      params: { facts: 'facts_v1', reply: 'reply_R021_v1', inputs: JSON.stringify(['source_return_policy_v1', 'reply_R021_v1']) }, TIMEOUT: 2_000,
    }))
    await expect(findImpact(bindings, graphName, 'source_return_policy_v1')).rejects.toMatchObject({ code: 'INCOMPLETE_AUDIT' })
  })

  it('reports an incomplete audit instead of silently truncating depth 13', async () => {
    await withGraph(bindings, graphName, async (graph) => {
      for (let index = 0; index <= 13; index++) {
        await graph.query(`CREATE (a:Artifact {id: $id, logicalId: $id, version: 1, kind: $kind,
          bodyJson: '{}', contentHash: $hash, dependencyHash: $hash, inputIdsJson: $inputs, depth: $depth,
          status: 'current', isCurrent: true, needsReview: false, createdAt: 1, stage: 'imported', promptVersion: 'v1'})
          WITH a OPTIONAL MATCH (parent:Artifact {id: $parent})
          FOREACH (p IN CASE WHEN parent IS NULL THEN [] ELSE [parent] END | CREATE (a)-[:DEPENDS_ON]->(p))`, {
          params: { id: `depth_${index}`, parent: index ? `depth_${index - 1}` : null, inputs: JSON.stringify(index ? [`depth_${index - 1}`] : []), kind: index ? 'assessment' : 'source', depth: index, hash: 'c'.repeat(64) }, TIMEOUT: 2_000,
        })
      }
    })
    await expect(findImpact(bindings, graphName, 'depth_0')).rejects.toMatchObject({ code: 'INCOMPLETE_AUDIT' })
  })
})

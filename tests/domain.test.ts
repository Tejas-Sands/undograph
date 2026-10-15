import { describe, expect, it } from 'vitest'
import type { Artifact, ImpactReport, PolicyFacts, WorkspaceSnapshot } from '../shared/contracts'
import { assessReturn, hashCanonical, planRepair, validateLineage, validatePolicyFacts } from '../worker/domain'

function artifact(id: string, kind: Artifact['kind'], inputIds: string[] = [], status: Artifact['status'] = 'current'): Artifact {
  return {
    id, logicalId: id, version: 1, kind, body: {}, inputIds, status,
    contentHash: 'a'.repeat(64), dependencyHash: 'b'.repeat(64), depth: 0,
    isCurrent: status !== 'superseded' && status !== 'candidate', needsReview: false,
    createdAt: 1, stage: 'test', promptVersion: 'v1',
  }
}

function scenario(): { snapshot: WorkspaceSnapshot; impact: ImpactReport } {
  const old = artifact('source_v1', 'source', [], 'superseded')
  const current = artifact('source_v2', 'source')
  current.logicalId = old.logicalId = 'policy'
  const facts = artifact('facts', 'policy-facts', [old.id], 'stale')
  const assessment21 = artifact('assessment21', 'assessment', [facts.id], 'stale')
  const assessment7 = artifact('assessment7', 'assessment', [facts.id], 'stale')
  const reply21 = artifact('reply21', 'reply', [assessment21.id], 'stale')
  const reply7 = artifact('reply7', 'reply', [assessment7.id], 'stale')
  const unrelated = artifact('account_reply', 'reply')
  unrelated.contentHash = 'f'.repeat(64)
  const affected = [reply7, assessment21, facts, reply21, assessment7]
  const artifacts = [old, current, facts, assessment21, assessment7, reply21, reply7, unrelated]
  const snapshot: WorkspaceSnapshot = {
    workspace: { id: 'workspace', revision: 1, createdAt: 1, expiresAt: 99 },
    artifacts, sessions: [], agents: [], runs: [], steps: [], changes: [], reports: [],
    edges: [
      ...artifacts.flatMap((item) => item.inputIds.map((input) => ({ from: item.id, to: input, type: 'DEPENDS_ON' as const }))),
      { from: current.id, to: old.id, type: 'SUPERSEDES' },
    ],
  }
  return { snapshot, impact: { sourceArtifactId: old.id, revision: 1, affected, paths: [], complete: true } }
}

function facts(window: number): Extract<PolicyFacts, { status: 'supported' }> {
  return { status: 'supported', returnWindowDays: window, sourceArtifactId: 'source_v1', evidenceQuote: `within ${window} days`, evidenceStart: 0, evidenceEnd: 14 }
}

describe('deterministic eligibility', () => {
  it.each([
    [30, 21, 'eligible'], [30, 7, 'eligible'], [14, 21, 'ineligible'],
    [14, 7, 'eligible'], [14, 14, 'eligible'], [14, 15, 'ineligible'],
  ] as const)('window %i and age %i yields %s', (window, age, decision) => {
    expect(assessReturn({ id: 'R-021', daysSinceDelivery: age, reason: 'change of mind' }, facts(window), {
      caseArtifactId: 'case_version_1', factsArtifactId: 'facts_version_1',
    })).toMatchObject({ decision, caseArtifactId: 'case_version_1', factsArtifactId: 'facts_version_1' })
  })

  it('requires review when policy extraction is unsupported', () => {
    expect(assessReturn({ id: 'R-021', daysSinceDelivery: 21, reason: 'change of mind' }, {
      status: 'needs-review', sourceArtifactId: 'source_v1', reason: 'Ambiguous policy',
    }, { caseArtifactId: 'case_version_1', factsArtifactId: 'facts_version_1' }).decision).toBe('needs-review')
  })
})

describe('canonical content and dependency hashing', () => {
  it('ignores object key ordering recursively', async () => {
    expect(await hashCanonical({ a: 1, b: { y: 2, z: 3 } })).toBe(await hashCanonical({ b: { z: 3, y: 2 }, a: 1 }))
  })

  it('changes when an exact input version or its supplied order changes', async () => {
    const first = await hashCanonical({ stage: 'reply', promptVersion: 'v1', inputs: ['facts_v1', 'case_v1'] })
    expect(first).not.toBe(await hashCanonical({ stage: 'reply', promptVersion: 'v1', inputs: ['facts_v2', 'case_v1'] }))
    expect(first).not.toBe(await hashCanonical({ stage: 'reply', promptVersion: 'v1', inputs: ['case_v1', 'facts_v1'] }))
  })

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY])('rejects non-JSON values: %s', async (value) => {
    await expect(hashCanonical({ value })).rejects.toThrow()
  })

  it('rejects cyclic objects', async () => {
    const value: { self?: unknown } = {}
    value.self = value
    await expect(hashCanonical(value)).rejects.toThrow()
  })
})

describe('graph-derived repair planning', () => {
  it('orders dependencies first, maps exact source versions, and preserves unrelated work', () => {
    const { snapshot, impact } = scenario()
    expect(planRepair(snapshot, impact)).toEqual({
      baseRevision: 1,
      artifactIds: ['facts', 'assessment21', 'assessment7', 'reply21', 'reply7'],
      sourceReplacements: { source_v1: 'source_v2' },
      preserved: [{ id: 'account_reply', contentHash: 'f'.repeat(64) }],
    })
  })

  it('does not strand existing stale work after a further source correction', () => {
    const { snapshot, impact } = scenario()
    snapshot.artifacts.find((item) => item.id === 'source_v2')!.isCurrent = false
    snapshot.artifacts.find((item) => item.id === 'source_v2')!.status = 'superseded'
    const newest = artifact('source_v3', 'source')
    newest.logicalId = 'policy'
    snapshot.artifacts.push(newest)
    snapshot.edges.push({ from: newest.id, to: 'source_v2', type: 'SUPERSEDES' })
    const plan = planRepair(snapshot, { ...impact, sourceArtifactId: 'source_v2', affected: [] })
    expect(plan.artifactIds).toHaveLength(5)
    expect(plan.sourceReplacements).toEqual({ source_v1: 'source_v3', source_v2: 'source_v3' })
  })

  it('deduplicates a shared descendant without losing dependency order', () => {
    const { snapshot, impact } = scenario()
    snapshot.artifacts.find((item) => item.id === 'reply21')!.inputIds.push('assessment7')
    snapshot.edges.push({ from: 'reply21', to: 'assessment7', type: 'DEPENDS_ON' })
    impact.affected.push(impact.affected.find((item) => item.id === 'reply21')!)
    expect(planRepair(snapshot, impact).artifactIds).toEqual(['facts', 'assessment21', 'assessment7', 'reply21', 'reply7'])
  })

  it('rejects corrupt cycles instead of returning a partial audit', () => {
    const { snapshot, impact } = scenario()
    snapshot.artifacts.find((item) => item.id === 'facts')!.inputIds.push('reply21')
    snapshot.edges.push({ from: 'facts', to: 'reply21', type: 'DEPENDS_ON' })
    expect(() => planRepair(snapshot, impact)).toThrow(/cycle/i)
  })

  it('rejects dependency depth 13', () => {
    const { snapshot } = scenario()
    snapshot.artifacts = Array.from({ length: 14 }, (_, index) => artifact(`depth_${index}`, index === 0 ? 'source' : 'assessment', index === 0 ? [] : [`depth_${index - 1}`]))
    snapshot.edges = snapshot.artifacts.flatMap((item) => item.inputIds.map((input) => ({ from: item.id, to: input, type: 'DEPENDS_ON' as const })))
    expect(() => validateLineage(snapshot)).toThrow(/depth/i)
  })
})

describe('evidence validation', () => {
  const text = 'Change-of-mind returns are accepted within 30 days of delivery.'

  function source() {
    return { ...artifact('source_v1', 'source'), body: { title: 'Return policy', category: 'return-policy', text } }
  }

  it('accepts a supported policy only with its exact source quote and span', () => {
    const candidate: PolicyFacts = { ...facts(30), status: 'supported', evidenceQuote: text, evidenceStart: 0, evidenceEnd: text.length }
    expect(validatePolicyFacts(candidate, source())).toEqual(candidate)
  })

  it.each([
    { returnWindowDays: 14 }, { evidenceStart: 1 }, { evidenceEnd: 2 },
    { evidenceQuote: 'A fabricated quotation' }, { sourceArtifactId: 'foreign_source' },
  ])('rejects fabricated or mismatched evidence: %j', (invalid) => {
    const candidate = { ...facts(30), evidenceQuote: text, evidenceStart: 0, evidenceEnd: text.length, ...invalid } as PolicyFacts
    expect(() => validatePolicyFacts(candidate, source())).toThrow()
  })
})

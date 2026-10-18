import { describe, expect, it } from 'vitest'
import { generalWorkspaceSchema, type Artifact } from '../shared/contracts'
import { expectedBuildIds, scenarioArtifacts } from '../shared/knowledge'
import { validateSourceNotes, validateAnswer } from '../worker/knowledge'

const config = {
  name: 'Atlas release',
  sources: [{ id: 'launch', title: 'Launch plan', text: 'Atlas launches November 12. Priya approves the release.' }, { id: 'owners', title: 'Ownership', text: 'Sam owns the release checklist.' }],
  questions: [{ id: 'date', question: 'When does Atlas launch?', sourceIds: ['launch'] }, { id: 'approval', question: 'Who approves the release?', sourceIds: ['launch'] }, { id: 'owner', question: 'Who owns the checklist?', sourceIds: ['owners'] }],
}
function artifact(id: string, kind: Artifact['kind'], body: unknown): Artifact {
  return { id, logicalId: id, kind, body, inputIds: [], version: 1, contentHash: 'a'.repeat(64), dependencyHash: 'b'.repeat(64), depth: 0, status: 'current', isCurrent: true, needsReview: false, createdAt: 1, stage: 'test', promptVersion: 'v1' } as Artifact
}

describe('custom workspace inputs', () => {
  it('keeps user-entered questions and explicit independent source scopes', () => {
    const parsed = generalWorkspaceSchema.parse(config)
    const inputs = scenarioArtifacts(parsed)
    expect(inputs.sources.map(s => s.logicalId)).toEqual(['source:launch', 'source:owners'])
    expect(inputs.cases[2].body).toMatchObject({ question: 'Who owns the checklist?', sourceIds: ['source:owners'] })
    expect(expectedBuildIds([...inputs.sources, ...inputs.cases].map(a => artifact(a.logicalId, 'category' in a.body ? 'source' : 'case', a.body))))
      .toEqual(['notes:launch', 'notes:owners', 'answer:date', 'answer:approval', 'answer:owner'])
  })
  it.each([
    { sources: [] }, { questions: [] },
    { sources: [config.sources[0], config.sources[0]] },
    { questions: [{ ...config.questions[0], sourceIds: ['missing'] }] },
    { questions: [{ ...config.questions[0], sourceIds: [] }] },
    { questions: [{ ...config.questions[0], sourceIds: ['launch', 'launch'] }] },
    { questions: [config.questions[0], config.questions[0]] },
    { sources: [{ ...config.sources[0], text: '   ' }] },
    { sources: [{ ...config.sources[0], text: 'x'.repeat(2001) }] },
    { questions: [{ ...config.questions[0], question: 'x'.repeat(501) }] },
  ])('rejects incomplete or ambiguous configuration %j', (change) => {
    expect(generalWorkspaceSchema.safeParse({ ...config, ...change }).success).toBe(false)
  })
})

describe('grounded general answers', () => {
  const source = artifact('source_launch_v1', 'source', { category: 'document', title: 'Launch plan', text: config.sources[0].text })
  source.logicalId = 'source:launch'
  it('derives exact quotation offsets from the supplied source version', () => {
    expect(validateSourceNotes({ summary: 'Launch date', quotes: ['Atlas launches November 12.'] }, source)).toMatchObject({ sourceArtifactId: source.id, quotes: [{ text: 'Atlas launches November 12.', start: 0, end: 27 }] })
  })
  it('rejects invented quotations and ambiguous repeated quotations', () => {
    expect(() => validateSourceNotes({ summary: 'Wrong date', quotes: ['Atlas launches December 1.'] }, source)).toThrow()
    expect(() => validateSourceNotes({ summary: 'Repeated', quotes: ['Sam'] }, artifact('s', 'source', { category: 'document', title: 'Owners', text: 'Sam and Sam' }))).toThrow()
  })
  it('returns an explicit review state for insufficient evidence', () => {
    expect(validateSourceNotes({ status: 'needs-review', summary: 'No usable facts', quotes: [] }, source).status).toBe('needs-review')
  })
  it('requires supplied source citations and refuses foreign or empty citations', () => {
    const question = artifact('question_date_v1', 'case', { id: 'date', question: 'When?', sourceIds: ['source:launch'] })
    const result = { decision: 'answered', text: 'November 12.', citations: [source.id], reviewRequired: true }
    expect(validateAnswer(result, [source, question])).toMatchObject({ sourceArtifactId: source.id, decision: 'answered' })
    expect(() => validateAnswer({ ...result, citations: ['foreign'] }, [source, question])).toThrow()
    expect(() => validateAnswer({ ...result, citations: [] }, [source, question])).toThrow()
  })
})

import { questionCaseSchema, type Artifact, type GeneralWorkspace } from './contracts'

export function scenarioArtifacts(scenario: GeneralWorkspace) {
  return {
    sources: scenario.sources.map(source => ({ id: `source_${source.id}_v1`, logicalId: `source:${source.id}`, body: { title: source.title, category: 'document' as const, text: source.text } })),
    cases: scenario.questions.map(question => ({ id: `question_${question.id}_v1`, logicalId: `case:${question.id}`, body: { id: question.id, question: question.question, sourceIds: question.sourceIds.map(source => `source:${source}`) } })),
  }
}

export function expectedBuildIds(roots: Artifact[]): string[] {
  const sources = roots.filter(artifact => artifact.kind === 'source' && (artifact.body as { category?: string }).category === 'document')
  if (!sources.length) return ['facts:return-policy', 'assessment:R021', 'reply:R021', 'assessment:R007', 'reply:R007', 'reply:A001']
  return [...sources.map(source => `notes:${source.logicalId.slice('source:'.length)}`),
    ...roots.filter(artifact => artifact.kind === 'case').map(question => `answer:${questionCaseSchema.parse(question.body).id}`)]
}

export const projectExample: GeneralWorkspace = {
  name: 'Atlas release',
  sources: [
    { id: 'launch', title: 'Launch plan', text: 'Atlas launches on November 12. Priya approves the release.' },
    { id: 'owners', title: 'Release ownership', text: 'Sam owns the release checklist. The weekly release meeting is on Tuesday.' },
  ],
  questions: [
    { id: 'date', question: 'When does Atlas launch?', sourceIds: ['launch'] },
    { id: 'approval', question: 'Who approves the release?', sourceIds: ['launch'] },
    { id: 'owner', question: 'Who owns the release checklist?', sourceIds: ['owners'] },
  ],
}
export const researchExample: GeneralWorkspace = {
  name: 'Field research',
  sources: [
    { id: 'study', title: 'Study notes', text: 'The garden survey observed 42 butterfly species in June. The survey covered three gardens.' },
    { id: 'methods', title: 'Collection method', text: 'Observers used visual counts. Lena coordinated the study.' },
  ],
  questions: [
    { id: 'species', question: 'How many butterfly species were observed?', sourceIds: ['study'] },
    { id: 'method', question: 'How were the observations collected?', sourceIds: ['methods'] },
  ],
}

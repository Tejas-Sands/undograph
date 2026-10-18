import { z } from 'zod'
import { questionCaseSchema, replyDraftSchema, sourceBodySchema, sourceNotesSchema, type Artifact, type ReplyDraft, type SourceNotes } from '../shared/contracts'
import { DomainError } from './domain'

export function validateSourceNotes(value: unknown, source: Artifact): SourceNotes {
  const input = z.object({ status: z.enum(['supported', 'needs-review']).default('supported'), summary: z.string().min(1).max(2_000), quotes: z.array(z.string().min(1).max(2_000)).max(4) }).parse(value)
  const body = sourceBodySchema.parse(source.body)
  if (source.kind !== 'source' || body.category !== 'document' || (input.status === 'supported' && !input.quotes.length)) throw new DomainError('INVALID_EVIDENCE', 'Source notes need exact evidence from the supplied document.', 422)
  const quotes = input.quotes.map(text => {
    const start = body.text.indexOf(text)
    if (start < 0 || body.text.indexOf(text, start+1) >= 0) throw new DomainError('INVALID_EVIDENCE', 'A quotation is absent or ambiguous in the supplied source.', 422)
    return { text, start, end: start+text.length }
  })
  return sourceNotesSchema.parse({ ...input, sourceArtifactId: source.id, quotes })
}

export function validateAnswer(value: unknown, inputs: Artifact[]): ReplyDraft {
  const answer = replyDraftSchema.parse(value)
  const question = inputs.find(artifact => artifact.kind === 'case')
  const sources = inputs.filter(artifact => artifact.kind === 'source' && sourceBodySchema.parse(artifact.body).category === 'document')
  if (!question || !sources.length) throw new DomainError('INVALID_DEPENDENCY', 'Answering requires a question and its selected sources.', 422)
  const selected = questionCaseSchema.parse(question.body).sourceIds
  const sourceIds = new Set(sources.map(source => source.id))
  if (selected.length !== sources.length || sources.some(source => !selected.includes(source.logicalId)) ||
    !['answered', 'needs-review'].includes(answer.decision) || !answer.citations.length ||
    answer.citations.some(id => !sourceIds.has(id)) ||
    (answer.sourceArtifactId && !sourceIds.has(answer.sourceArtifactId)) || answer.assessmentArtifactId) {
    throw new DomainError('INVALID_EVIDENCE', 'Answers must cite their supplied source versions and recorded question scope.', 422)
  }
  return { ...answer, sourceArtifactId: answer.citations[0] }
}

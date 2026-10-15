import { assessmentSchema, returnCaseSchema, sourceBodySchema, type Artifact, type PolicyFacts } from '../../shared/contracts'
import { assessReturn } from '../../worker/domain'
import type { Env } from '../../worker/env'
import { loadSnapshot, recordArtifact } from '../../worker/graph/store'

export async function supportWork(env: Env, graphName: string) {
  const snapshot = await loadSnapshot(env, graphName)
  const source = snapshot.artifacts.find((artifact) => artifact.id === 'source_return_policy_v1')!
  const text = sourceBodySchema.parse(source.body).text
  const quote = 'Change-of-mind returns are accepted within 30 days of delivery.'
  const evidenceStart = text.indexOf(quote)
  const facts: PolicyFacts = { status: 'supported', returnWindowDays: 30, sourceArtifactId: source.id, evidenceQuote: quote, evidenceStart, evidenceEnd: evidenceStart + quote.length }
  const factsArtifact = await recordArtifact(env, graphName, {
    id: 'facts_v1', logicalId: 'facts:return-policy', kind: 'policy-facts', body: facts,
    inputIds: [source.id], expectedRevision: 0, stage: 'extract-policy', promptVersion: 'v1',
  })
  const generated: Artifact[] = [factsArtifact]
  for (const [caseId, suffix] of [['case_R021_v1', 'R021'], ['case_R007_v1', 'R007']]) {
    const ticket = snapshot.artifacts.find((artifact) => artifact.id === caseId)!
    const assessment = await recordArtifact(env, graphName, {
      id: `assessment_${suffix}_v1`, logicalId: `assessment:${suffix}`, kind: 'assessment',
      body: assessReturn(returnCaseSchema.parse(ticket.body), facts, { caseArtifactId: ticket.id, factsArtifactId: factsArtifact.id }),
      inputIds: [factsArtifact.id, ticket.id], expectedRevision: 0, stage: 'assess-return', promptVersion: 'v1',
    })
    generated.push(assessment)
    generated.push(await recordArtifact(env, graphName, {
      id: `reply_${suffix}_v1`, logicalId: `reply:${suffix}`, kind: 'reply',
      body: { assessmentArtifactId: assessment.id, decision: assessmentSchema.parse(assessment.body).decision, text: 'This request is eligible under the 30-day window.', citations: [source.id], reviewRequired: true },
      inputIds: [assessment.id, ticket.id, source.id], expectedRevision: 0, stage: 'draft-reply', promptVersion: 'v1',
    }))
  }
  generated.push(await recordArtifact(env, graphName, {
    id: 'reply_A001_v1', logicalId: 'reply:A001', kind: 'reply',
    body: { sourceArtifactId: 'source_account_help_v1', decision: 'account-help', text: 'Choose Forgot password on the sign-in page and follow your reset link.', citations: ['source_account_help_v1'], reviewRequired: true },
    inputIds: ['source_account_help_v1', 'case_A001_v1'], expectedRevision: 0, stage: 'draft-account-help', promptVersion: 'v1',
  }))
  return generated
}

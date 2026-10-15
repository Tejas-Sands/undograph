import { describe, expect, it, vi } from 'vitest'
import { extractPolicy, draftReply, type ReplyInput } from '../worker/agents'
import type { Env } from '../worker/env'
import type { Artifact, JsonValue } from '../shared/contracts'

const text = 'Change-of-mind returns are accepted within 30 days of delivery.'
function artifact(id: string, kind: Artifact['kind'], body: JsonValue): Artifact {
  return { id, kind, body, logicalId: id, version: 1, contentHash: 'a'.repeat(64), dependencyHash: 'b'.repeat(64), inputIds: [], depth: 0, status: 'current', isCurrent: true, needsReview: false, createdAt: 1, stage: 'test', promptVersion: 'v1' }
}
const source = artifact('policy_v1', 'source', { title: 'Returns', category: 'return-policy', text })
const valid = { status: 'supported', returnWindowDays: 30, evidenceQuote: text }
const input: ReplyInput = {
  artifacts: [source, artifact('case_v1', 'case', { id: 'R021', daysSinceDelivery: 21, reason: 'change of mind' }),
    artifact('assessment_v1', 'assessment', { caseArtifactId: 'case_v1', factsArtifactId: 'facts_v1', decision: 'eligible', explanation: '21 <= 30' })],
}
function provider(responses: unknown[]) {
  const run = vi.fn()
  for (const response of responses) {
    if (response instanceof Error) run.mockRejectedValueOnce(response)
    else run.mockResolvedValueOnce({ response: typeof response === 'string' ? response : JSON.stringify(response), usage: { prompt_tokens: 12, completion_tokens: 8 } })
  }
  return { env: { AI: { run } } as unknown as Env, run, beforeCall: vi.fn(async () => {}) }
}

describe('bounded policy interpretation', () => {
  it('validates exact evidence, computes offsets and preserves provider usage', async () => {
    const { env, run, beforeCall } = provider([valid])
    const result = await extractPolicy(env, source, beforeCall)
    expect(result.value).toEqual({ ...valid, sourceArtifactId: source.id, evidenceStart: 0, evidenceEnd: text.length })
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 8 })
    expect(beforeCall).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0][1]).toMatchObject({ temperature: 0, max_tokens: 600, response_format: { type: 'json_object' } })
  })
  it.each([
    { ...valid, evidenceStart: 7, evidenceEnd: 20 },
    { ...valid, evidenceQuote: 'Returns accepted for 30 days.' },
    { ...valid, returnWindowDays: 90 },
    { ...valid, sourceArtifactId: 'foreign' },
    'this is not JSON',
  ])('rejects fabricated or malformed evidence after one correction', async (response) => {
    const { env, run, beforeCall } = provider([response, response])
    await expect(extractPolicy(env, source, beforeCall)).rejects.toMatchObject({ code: 'INVALID_MODEL_OUTPUT' })
    expect(run).toHaveBeenCalledTimes(2)
    expect(beforeCall).toHaveBeenCalledTimes(2)
  })
  it('allows explicit needs-review without guessing a policy window', async () => {
    const { env, beforeCall } = provider([{ status: 'needs-review', reason: 'Conflicting policy statements.' }])
    expect((await extractPolicy(env, source, beforeCall)).value).toEqual({ status: 'needs-review', reason: 'Conflicting policy statements.', sourceArtifactId: source.id })
  })
  it('makes provider failure visible without a recorded fallback', async () => {
    const { env, run, beforeCall } = provider([Object.assign(new Error('private provider details'), { status: 503 })])
    await expect(extractPolicy(env, source, beforeCall)).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE', retryable: true })
    expect(run).toHaveBeenCalledTimes(1)
  })
  it('does not call the provider when quota reservation fails', async () => {
    const { env, run } = provider([valid])
    await expect(extractPolicy(env, source, async () => { throw new Error('Quota exceeded') })).rejects.toThrow('Quota exceeded')
    expect(run).not.toHaveBeenCalled()
  })
})

describe('reply validation', () => {
  const reply = { decision: 'eligible', text: 'Your request is within the supported return window.', citations: ['policy_v1'], reviewRequired: true }
  it('binds a valid reply to its supplied assessment', async () => {
    const { env, beforeCall } = provider([reply])
    expect((await draftReply(env, input, beforeCall)).value).toEqual({ ...reply, assessmentArtifactId: 'assessment_v1' })
  })
  it.each([
    { ...reply, citations: ['foreign'] },
    { ...reply, decision: 'ineligible' },
    { ...reply, assessmentArtifactId: 'foreign' },
    { ...reply, reviewRequired: false },
    { ...reply, text: '' },
  ])('rejects inconsistent replies', async (bad) => {
    const { env, beforeCall } = provider([bad, bad])
    await expect(draftReply(env, input, beforeCall)).rejects.toMatchObject({ code: 'INVALID_MODEL_OUTPUT' })
  })
  it('keeps missing token measurements unavailable', async () => {
    const env = { AI: { run: async () => ({ response: JSON.stringify(reply) }) } } as unknown as Env
    expect((await draftReply(env, input, async () => {})).usage).toEqual({})
  })
})

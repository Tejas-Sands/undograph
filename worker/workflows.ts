import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from 'cloudflare:workers'
import { NonRetryableError } from 'cloudflare:workflows'
import { assessmentSchema, jsonSchema, policyFactsSchema, questionCaseSchema, returnCaseSchema, type Artifact } from '../shared/contracts'
import { answerQuestion, draftReply, extractPolicy, extractSourceNotes, InvalidModelOutput, ModelUnavailable, type ModelResult } from './agents'
import { assessReturn, DomainError, validateLineage } from './domain'
import type { Env, WorkflowParams } from './env'
import { loadSnapshot, queryGraph } from './graph/store'
import { beginRun, failRun, logAttempt, openStep, promoteBuild, saveOutput } from './runs'
import { loadRepairPlan, promoteRepair } from './repair'

const databaseStep = { retries: { limit: 2, delay: '1 second' as const }, timeout: '30 seconds' as const }
const modelStep = { retries: { limit: 1, delay: '3 seconds' as const }, timeout: '60 seconds' as const }

// JSON text keeps recursive domain JSON types out of the RPC serializability type constraint.
async function checkpoint<T>(step: WorkflowStep, name: string, config: WorkflowStepConfig, work: () => Promise<T>): Promise<T> {
  const json = await step.do(name, config, async () => JSON.stringify(await work()))
  return JSON.parse(json) as T
}

async function nonRetryable<T>(work: () => Promise<T>): Promise<T> {
  try { return await work() }
  catch (error) {
    if (error instanceof DomainError && !(error instanceof ModelUnavailable && error.retryable)) {
      throw new NonRetryableError(`${error.code}: ${error.message}`)
    }
    throw error
  }
}

function outputRunner(env: Env, params: WorkflowParams, step: WorkflowStep) {
  const { graphName, runId, baseRevision } = params
  return async (stage: string, logicalId: string, kind: Artifact['kind'], inputIds: string[], inference: ((inputs: Artifact[]) => Promise<ModelResult<unknown>>) | undefined, deterministic?: (inputs: Artifact[]) => unknown, supersedesId?: string) => {
    const analyst = kind === 'policy-facts' || kind === 'source-notes'
    const inputs = await checkpoint(step, `${stage}.read`, databaseStep, () => nonRetryable(() => openStep(env, graphName, runId, stage, inputIds, analyst)))
    const generated = inference
      ? await checkpoint(step, `${stage}.model`, modelStep, () => nonRetryable(async () => {
        try {
          const result = await inference(inputs)
          return { valid: true as const, value: jsonSchema.parse(result.value), usage: result.usage }
        } catch (error) {
          if (error instanceof InvalidModelOutput) return { valid: false as const, usage: error.usage }
          throw error
        }
      }))
      : { valid: true as const, value: jsonSchema.parse(deterministic!(inputs)), usage: {} }
    if (!generated.valid) {
      await step.do(`${stage}.usage`, databaseStep, async () => {
        await queryGraph(env, graphName, 'recordUsage', { stepId: `${runId}_${stage}`, inputTokens: generated.usage.inputTokens ?? null, outputTokens: generated.usage.outputTokens ?? null })
        return stage
      })
      throw new InvalidModelOutput(generated.usage)
    }
    return checkpoint(step, `${stage}.save`, databaseStep, () => nonRetryable(() => saveOutput(env, graphName, {
      id: `${runId}_${stage}_output`, logicalId, kind, body: generated.value, inputIds, expectedRevision: baseRevision,
      status: 'candidate', stage, promptVersion: 'v1', runId, stepId: `${runId}_${stage}`,
      sessionId: `${runId}_${analyst ? 'analyst' : 'reply'}`, ...(supersedesId ? { supersedesId } : {}),
    }, generated.usage)))
  }
}

async function recordFailure(env: Env, params: WorkflowParams, step: WorkflowStep, error: unknown) {
  await step.do('record run failure', databaseStep, async () => {
    // Workflow RPC preserves message text; keep the required NonRetryableError name intact.
    const code = error instanceof Error ? error.message.match(/(?:^|NonRetryableError: )([A-Z][A-Z_]{1,79}): /)?.[1] : undefined
    await failRun(env, params.graphName, params.runId, error instanceof DomainError ? error : new DomainError(code ?? 'RUN_FAILED', 'The run failed.'))
    return params.runId
  })
}

export async function executeBuild(env: Env, params: WorkflowParams, step: WorkflowStep): Promise<string> {
  const { graphName, runId, baseRevision, visitorId } = params
  try {
    const roots = await checkpoint(step, 'begin build', databaseStep, () => nonRetryable(async () => {
      await beginRun(env, graphName, runId)
      return (await loadSnapshot(env, graphName)).artifacts.filter((artifact) => artifact.isCurrent && ['source', 'case'].includes(artifact.kind))
    }))
    function root(logicalId: string): Artifact {
      const artifact = roots.find((value) => value.logicalId === logicalId)
      if (!artifact) throw new DomainError('NOT_FOUND', 'Required synthetic input is missing.', 404)
      return artifact
    }
    const output = outputRunner(env, params, step)
    const documents = roots.filter(artifact => artifact.kind === 'source' && (artifact.body as { category?: string }).category === 'document')
    if (documents.length) {
      const notes = new Map<string, Artifact>()
      for (const document of documents) {
        const suffix = document.logicalId.slice('source:'.length)
        const stage = `notes-${suffix}`
        notes.set(document.logicalId, await output(stage, `notes:${suffix}`, 'source-notes', [document.id],
          inputs => extractSourceNotes(env, inputs[0], () => logAttempt(env, graphName, visitorId, runId, stage))))
      }
      for (const question of roots.filter(artifact => artifact.kind === 'case')) {
        const data = questionCaseSchema.parse(question.body)
        const sources = data.sourceIds.map(id => root(id))
        const inputs = [question.id, ...sources.flatMap(source => [source.id, notes.get(source.logicalId)!.id])]
        const stage = `answer-${data.id}`
        await output(stage, `answer:${data.id}`, 'reply', inputs,
          artifacts => answerQuestion(env, { artifacts }, () => logAttempt(env, graphName, visitorId, runId, stage)))
      }
      await step.do('publish build', databaseStep, () => nonRetryable(async () => { await promoteBuild(env, graphName, runId, baseRevision); return runId }))
      return runId
    }
    const policy = root('source:return-policy')
    const facts = await output('extract-policy', 'facts:return-policy', 'policy-facts', [policy.id],
      (inputs) => extractPolicy(env, inputs[0], () => logAttempt(env, graphName, visitorId, runId, 'extract-policy')))
    for (const suffix of ['R021', 'R007']) {
      const ticket = root(`case:${suffix[0]}-${suffix.slice(1)}`)
      const assessment = await output(`assess-${suffix}`, `assessment:${suffix}`, 'assessment', [facts.id, ticket.id], undefined,
        (inputs) => assessReturn(returnCaseSchema.parse(inputs[1].body), policyFactsSchema.parse(inputs[0].body), { caseArtifactId: ticket.id, factsArtifactId: facts.id }))
      assessmentSchema.parse(assessment.body)
      await output(`reply-${suffix}`, `reply:${suffix}`, 'reply', [assessment.id, ticket.id, policy.id],
        (inputs) => draftReply(env, { artifacts: inputs }, () => logAttempt(env, graphName, visitorId, runId, `reply-${suffix}`)))
    }
    const account = root('source:account-help')
    const ticket = root('case:A-001')
    await output('reply-A001', 'reply:A001', 'reply', [account.id, ticket.id],
      (inputs) => draftReply(env, { artifacts: inputs }, () => logAttempt(env, graphName, visitorId, runId, 'reply-A001')))
    await step.do('publish build', databaseStep, () => nonRetryable(async () => { await promoteBuild(env, graphName, runId, baseRevision); return runId }))
    return runId
  } catch (error) {
    await recordFailure(env, params, step, error)
    throw error
  }
}
export class BuildWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) { return executeBuild(this.env, event.payload, step) }
}
export async function executeRepair(env: Env, params: WorkflowParams, step: WorkflowStep): Promise<string> {
  const { graphName, runId, baseRevision, visitorId } = params
  try {
    const { plan, artifacts } = await checkpoint(step, 'begin repair', databaseStep, () => nonRetryable(async () => {
      await beginRun(env, graphName, runId)
      const snapshot = await loadSnapshot(env, graphName)
      validateLineage(snapshot)
      return { plan: await loadRepairPlan(env, graphName, runId), artifacts: snapshot.artifacts }
    }))
    const mapping = new Map(Object.entries(plan.sourceReplacements))
    const output = outputRunner(env, params, step)
    for (const [index, id] of plan.artifactIds.entries()) {
      const old = artifacts.find((a) => a.id === id)
      if (!old) throw new DomainError('INCOMPLETE_AUDIT', 'A planned artifact is missing.')
      const inputIds = old.inputIds.map((inputId) => mapping.get(inputId) ?? inputId)
      const stage = `repair-${index}-${old.kind}`
      const beforeCall = () => logAttempt(env, graphName, visitorId, runId, stage)
      const infer = old.kind === 'source-notes'
        ? (inputs: Artifact[]) => extractSourceNotes(env, inputs.find(a => a.kind === 'source')!, beforeCall)
        : old.kind === 'policy-facts'
        ? (inputs: Artifact[]) => extractPolicy(env, inputs.find((a) => a.kind === 'source')!, beforeCall)
        : old.kind === 'reply' ? (inputs: Artifact[]) => inputs.some(a => a.kind === 'case' && questionCaseSchema.safeParse(a.body).success)
          ? answerQuestion(env, { artifacts: inputs }, beforeCall) : draftReply(env, { artifacts: inputs }, beforeCall) : undefined
      const assess = (inputs: Artifact[]) => {
        const ticket = inputs.find((a) => a.kind === 'case')!
        const facts = inputs.find((a) => a.kind === 'policy-facts')!
        return assessReturn(returnCaseSchema.parse(ticket.body), policyFactsSchema.parse(facts.body), { caseArtifactId: ticket.id, factsArtifactId: facts.id })
      }
      if (!['policy-facts', 'assessment', 'reply', 'source-notes'].includes(old.kind)) throw new DomainError('INCOMPLETE_AUDIT', 'Only derived work can be repaired.')
      const replacement = await output(stage, old.logicalId, old.kind, inputIds, infer, assess, old.id)
      mapping.set(old.id, replacement.id)
    }
    await step.do('publish repair', databaseStep, () => nonRetryable(async () => { await promoteRepair(env, graphName, runId, baseRevision); return runId }))
    return runId
  } catch (error) {
    await recordFailure(env, params, step, error)
    throw error
  }
}
export class RepairWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) { return executeRepair(this.env, event.payload, step) }
}

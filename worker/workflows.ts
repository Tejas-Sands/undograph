import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from 'cloudflare:workers'
import { NonRetryableError } from 'cloudflare:workflows'
import { assessmentSchema, jsonSchema, policyFactsSchema, returnCaseSchema, type Artifact } from '../shared/contracts'
import { draftReply, extractPolicy, ModelUnavailable, type ModelResult } from './agents'
import { assessReturn, DomainError } from './domain'
import type { Env, WorkflowParams } from './env'
import { loadSnapshot } from './graph/store'
import { beginRun, failRun, logAttempt, openStep, promoteBuild, saveOutput } from './runs'

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
    async function output(stage: string, logicalId: string, kind: Artifact['kind'], inputIds: string[], inference: ((inputs: Artifact[]) => Promise<ModelResult<unknown>>) | undefined, deterministic?: (inputs: Artifact[]) => unknown) {
      const analyst = stage === 'extract-policy'
      const inputs = await checkpoint(step, `${stage}.read`, databaseStep, () => nonRetryable(() => openStep(env, graphName, runId, stage, inputIds, analyst)))
      const generated = inference
        ? await checkpoint(step, `${stage}.model`, modelStep, () => nonRetryable(async () => {
          const result = await inference(inputs)
          return { value: jsonSchema.parse(result.value), usage: result.usage }
        }))
        : { value: jsonSchema.parse(deterministic!(inputs)), usage: {} }
      return checkpoint(step, `${stage}.save`, databaseStep, () => nonRetryable(() => saveOutput(env, graphName, {
        id: `${runId}_${stage}_output`, logicalId, kind, body: generated.value, inputIds, expectedRevision: baseRevision,
        status: 'candidate', stage, promptVersion: 'v1', runId, stepId: `${runId}_${stage}`,
        sessionId: `${runId}_${analyst ? 'analyst' : 'reply'}`,
      }, generated.usage)))
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
    await step.do('record build failure', databaseStep, async () => {
      // Workflow RPC preserves message text; keep the required NonRetryableError name intact.
      const code = error instanceof Error ? error.message.match(/(?:^|NonRetryableError: )([A-Z][A-Z_]{1,79}): /)?.[1] : undefined
      const domain = error instanceof DomainError ? error : new DomainError(code ?? 'RUN_FAILED', 'The run failed.')
      await failRun(env, graphName, runId, domain)
      return runId
    })
    throw error
  }
}
export class BuildWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) { return executeBuild(this.env, event.payload, step) }
}

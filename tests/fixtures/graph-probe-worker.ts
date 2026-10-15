import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import type { Env } from '../../worker/env'
import { withGraph } from '../../worker/graph/client'
import { BuildWorkflow, RepairWorkflow } from '../../worker/workflows'
import { syntheticAI } from '../helpers/synthetic-ai'

export { default } from '../../worker/index'
export { BuildWorkflow, RepairWorkflow }

export class TestBuildWorkflow extends BuildWorkflow {
  async run(event: Parameters<BuildWorkflow['run']>[0], step: WorkflowStep) {
    this.env.CONTROL_GRAPH = event.payload.controlGraph
    this.env.AI = { run: async (_model: unknown, input: unknown) => syntheticAI(input) } as unknown as Ai
    return super.run(event, step)
  }
}

export class FailedBuildWorkflow extends BuildWorkflow {
  async run(event: Parameters<BuildWorkflow['run']>[0], step: WorkflowStep) {
    this.env.CONTROL_GRAPH = event.payload.controlGraph
    this.env.AI = { run: async () => { throw Object.assign(new Error('test provider authorization refused'), { status: 401 }) } } as unknown as Ai
    return super.run(event, step)
  }
}

export class TestRepairWorkflow extends RepairWorkflow {
  async run(event: Parameters<RepairWorkflow['run']>[0], step: WorkflowStep) {
    this.env.CONTROL_GRAPH = event.payload.controlGraph
    this.env.AI = { run: async (_model: unknown, input: unknown) => syntheticAI(input) } as unknown as Ai
    return super.run(event, step)
  }
}

export interface ProbeParams {
  graphName: string
  value: number
}

export class GraphProbeWorkflow extends WorkflowEntrypoint<Env, ProbeParams> {
  async run(event: WorkflowEvent<ProbeParams>, step: WorkflowStep) {
    return step.do('query disposable graph', {
      retries: { limit: 0, delay: '1 second' },
      timeout: '15 seconds',
    }, () => withGraph(this.env, event.payload.graphName, async (graph) => {
      try {
        const result = await graph.query<{ value: number }>('RETURN $value AS value', {
          params: { value: event.payload.value }, TIMEOUT: 2_000,
        })
        return result.data?.[0] ?? null
      } finally {
        await graph.delete()
      }
    }))
  }
}

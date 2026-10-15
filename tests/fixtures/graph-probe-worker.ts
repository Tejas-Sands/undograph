import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import type { Env } from '../../worker/env'
import { withGraph } from '../../worker/graph/client'

export { default } from '../../worker/index'

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

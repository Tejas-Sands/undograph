export interface WorkflowParams {
  graphName: string
  runId: string
  baseRevision: number
  visitorId: string
  controlGraph?: string
}

export interface Env {
  ASSETS?: Fetcher
  AI?: Ai
  BUILD_WORKFLOW?: Workflow<WorkflowParams>
  REPAIR_WORKFLOW?: Workflow<WorkflowParams>
  ENVIRONMENT: 'local' | 'preview' | 'production'
  GRAPH_PREFIX: string
  FALKORDB_HOST?: string
  FALKORDB_PORT?: string
  FALKORDB_TLS?: string
  FALKORDB_USERNAME?: string
  FALKORDB_PASSWORD?: string
  SESSION_SECRET?: string
  CONTROL_GRAPH?: string
  GRAPH_GATEWAY_URL?: string
  GRAPH_GATEWAY_TOKEN?: string
}

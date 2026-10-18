import { z } from 'zod'

const id = z.string().min(1).max(160)
const timestamp = z.number().int().nonnegative()
const hash = z.string().regex(/^[a-f0-9]{64}$/)
export const jsonSchema = z.json()
export type JsonValue = z.infer<typeof jsonSchema>

export const sourceBodySchema = z.object({
  title: z.string().min(1).max(160),
  category: z.enum(['return-policy', 'account-help', 'document']),
  text: z.string().min(1).max(8_000),
})
export type SourceBody = z.infer<typeof sourceBodySchema>

export const returnCaseSchema = z.object({
  id,
  daysSinceDelivery: z.number().int().min(0).max(3_650),
  reason: z.string().min(1).max(500),
})
export type ReturnCase = z.infer<typeof returnCaseSchema>
export const accountCaseSchema = z.object({ id, topic: z.literal('password-reset'), message: z.string().min(1).max(500) })

const inputId = z.string().regex(/^[a-zA-Z0-9_-]{1,48}$/)
export const generalWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  sources: z.array(z.object({ id: inputId, title: z.string().trim().min(1).max(160), text: z.string().trim().min(1).max(2_000) }).strict()).min(1).max(3),
  questions: z.array(z.object({ id: inputId, question: z.string().trim().min(1).max(500), sourceIds: z.array(inputId).min(1).max(3) }).strict()).min(1).max(3),
}).strict().superRefine((value, context) => {
  const sources = new Set(value.sources.map(source => source.id))
  if (sources.size !== value.sources.length) context.addIssue({ code: 'custom', message: 'Source IDs must be unique.', path: ['sources'] })
  if (new Set(value.questions.map(question => question.id)).size !== value.questions.length) context.addIssue({ code: 'custom', message: 'Question IDs must be unique.', path: ['questions'] })
  value.questions.forEach((question, index) => {
    if (new Set(question.sourceIds).size !== question.sourceIds.length || question.sourceIds.some(source => !sources.has(source))) {
      context.addIssue({ code: 'custom', message: 'Select distinct sources that exist in this workspace.', path: ['questions', index, 'sourceIds'] })
    }
  })
})
export type GeneralWorkspace = z.infer<typeof generalWorkspaceSchema>
export const workspaceInputSchema = z.object({ scenario: generalWorkspaceSchema.optional() }).strict()
export const questionCaseSchema = z.object({ id, question: z.string().min(1).max(500), sourceIds: z.array(id).min(1).max(3) })
export const sourceNotesSchema = z.object({
  status: z.enum(['supported', 'needs-review']), sourceArtifactId: id,
  summary: z.string().min(1).max(2_000),
  quotes: z.array(z.object({ text: z.string().min(1).max(2_000), start: z.number().int().nonnegative(), end: z.number().int().positive() })).max(4),
})
export type SourceNotes = z.infer<typeof sourceNotesSchema>

export const policyFactsSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('supported'),
    returnWindowDays: z.number().int().min(1).max(365),
    sourceArtifactId: id,
    evidenceQuote: z.string().min(1).max(2_000),
    evidenceStart: z.number().int().nonnegative(),
    evidenceEnd: z.number().int().positive(),
  }),
  z.object({ status: z.literal('needs-review'), sourceArtifactId: id, reason: z.string().min(1).max(1_000) }),
])
export type PolicyFacts = z.infer<typeof policyFactsSchema>

export const decisionSchema = z.enum(['eligible', 'ineligible', 'needs-review'])
export const assessmentSchema = z.object({
  caseArtifactId: id,
  factsArtifactId: id,
  decision: decisionSchema,
  explanation: z.string().min(1).max(2_000),
})
export type Assessment = z.infer<typeof assessmentSchema>

export const replyDraftSchema = z.object({
  assessmentArtifactId: id.optional(),
  sourceArtifactId: id.optional(),
  decision: z.enum(['eligible', 'ineligible', 'needs-review', 'account-help', 'answered']),
  text: z.string().min(1).max(4_000),
  citations: z.array(id).min(1).max(12),
  reviewRequired: z.literal(true),
})
export type ReplyDraft = z.infer<typeof replyDraftSchema>

export const artifactKindSchema = z.enum(['source', 'case', 'policy-facts', 'assessment', 'reply', 'source-notes'])
export const artifactStatusSchema = z.enum(['candidate', 'current', 'stale', 'superseded', 'released'])
export const artifactSchema = z.object({
  id,
  logicalId: id,
  version: z.number().int().positive(),
  kind: artifactKindSchema,
  body: jsonSchema,
  contentHash: hash,
  dependencyHash: hash,
  inputIds: z.array(id).max(32),
  depth: z.number().int().nonnegative(),
  status: artifactStatusSchema,
  isCurrent: z.boolean(),
  needsReview: z.boolean(),
  createdAt: timestamp,
  runId: id.optional(),
  stepId: id.optional(),
  sessionId: id.optional(),
  stage: z.string(),
  promptVersion: z.string(),
})
export type Artifact = z.infer<typeof artifactSchema>

export const sessionSchema = z.object({ id, createdAt: timestamp, label: z.string() })
export type Session = z.infer<typeof sessionSchema>
export const agentSchema = z.object({ id, role: z.enum(['policy-analyst', 'reply-agent']) })
export type Agent = z.infer<typeof agentSchema>

export const runSchema = z.object({
  id,
  type: z.enum(['build', 'repair']),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'obsolete']),
  baseRevision: z.number().int().nonnegative(),
  requestHash: hash,
  createdAt: timestamp,
  completedAt: timestamp.optional(),
  errorCode: z.string().optional(),
  modelCalls: z.number().int().nonnegative(),
  sourceArtifactId: id.optional(),
  origin: z.enum(['live', 'recorded']),
})
export type Run = z.infer<typeof runSchema>

export const stepSchema = z.object({
  id,
  runId: id,
  stage: z.string(),
  status: z.enum(['queued', 'running', 'succeeded', 'failed']),
  attempts: z.number().int().nonnegative(),
  startedAt: timestamp.optional(),
  completedAt: timestamp.optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
})
export type Step = z.infer<typeof stepSchema>

export const changeSchema = z.object({
  id, oldSourceId: id, newSourceId: id, reason: z.string(), createdAt: timestamp, revision: z.number().int().nonnegative(),
})
export type Change = z.infer<typeof changeSchema>
export const preservedArtifactSchema = z.object({ id, contentHash: hash })
export const repairReportSchema = z.object({
  id, runId: id, revision: z.number().int().nonnegative(), createdAt: timestamp,
  repairedLogicalIds: z.array(id), preserved: z.array(preservedArtifactSchema),
})
export type RepairReport = z.infer<typeof repairReportSchema>

export const workspaceSchema = z.object({
  id, revision: z.number().int().nonnegative(), createdAt: timestamp, expiresAt: timestamp, activeRunId: id.optional(),
  name: z.string().optional(), mode: z.enum(['support', 'knowledge']).optional(), configHash: hash.optional(),
})
export const edgeSchema = z.object({
  from: id,
  to: id,
  type: z.enum(['DEPENDS_ON', 'SUPERSEDES', 'IN_SESSION', 'EXECUTED_BY', 'HAS_STEP', 'READ', 'PRODUCED', 'REPLACES', 'INTRODUCES']),
})
export type Edge = z.infer<typeof edgeSchema>
export const workspaceSnapshotSchema = z.object({
  workspace: workspaceSchema,
  artifacts: z.array(artifactSchema),
  sessions: z.array(sessionSchema),
  agents: z.array(agentSchema),
  runs: z.array(runSchema),
  steps: z.array(stepSchema),
  changes: z.array(changeSchema),
  reports: z.array(repairReportSchema),
  edges: z.array(edgeSchema),
})
export type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>

export const impactReportSchema = z.object({
  sourceArtifactId: id,
  revision: z.number().int().nonnegative(),
  affected: z.array(artifactSchema),
  paths: z.array(z.array(id)),
  complete: z.literal(true),
})
export type ImpactReport = z.infer<typeof impactReportSchema>
export const repairPlanSchema = z.object({ baseRevision: z.number().int().nonnegative(), artifactIds: z.array(id), sourceReplacements: z.record(id, id), preserved: z.array(preservedArtifactSchema) })
export type RepairPlan = z.infer<typeof repairPlanSchema>

export const artifactWriteSchema = z.object({
  id, logicalId: id, kind: artifactKindSchema, body: jsonSchema,
  inputIds: z.array(id).max(32),
  expectedRevision: z.number().int().nonnegative(),
  status: z.enum(['current', 'candidate']).default('current'),
  stage: z.string().min(1).max(120),
  promptVersion: z.string().min(1).max(120),
  runId: id.optional(), stepId: id.optional(), sessionId: id.optional(), supersedesId: id.optional(),
})
export type ArtifactWrite = z.input<typeof artifactWriteSchema>
export const correctionRequestSchema = z.object({
  sourceArtifactId: id,
  expectedRevision: z.number().int().nonnegative(),
  returnWindowDays: z.number().int().min(1).max(365),
  reason: z.string().trim().min(1).max(500),
})
export type CorrectionRequest = z.infer<typeof correctionRequestSchema>
export const documentCorrectionSchema = z.object({ sourceArtifactId: id, expectedRevision: z.number().int().nonnegative(), text: z.string().trim().min(1).max(2_000), reason: z.string().trim().min(1).max(500) })
export type DocumentCorrection = z.infer<typeof documentCorrectionSchema>
export const runRequestSchema = z.object({
  kind: z.enum(['build', 'repair']), expectedRevision: z.number().int().nonnegative(), sourceArtifactId: id.optional(),
})
export type RunRequest = z.infer<typeof runRequestSchema>
export const runResultSchema = z.object({ run: runSchema, steps: z.array(stepSchema), report: repairReportSchema.optional() })
export type RunResult = z.infer<typeof runResultSchema>

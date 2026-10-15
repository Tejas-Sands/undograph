import type { Artifact, JsonValue, WorkspaceSnapshot } from '../shared/contracts'

export function fields(artifact: Artifact): Record<string, JsonValue> {
  return artifact.body && typeof artifact.body === 'object' && !Array.isArray(artifact.body)
    ? artifact.body
    : {}
}
export function artifactTitle(artifact: Artifact, snapshot?: WorkspaceSnapshot): string {
  const body = fields(artifact)
  if (artifact.kind === 'source') return String(body.title)
  if (artifact.kind === 'case') return `Case ${String(body.id)}`
  if (artifact.kind === 'policy-facts') return 'Return-policy facts'
  const ticket = snapshot?.artifacts.find(
    (a) => a.kind === 'case' && artifact.inputIds.includes(a.id),
  )
  const suffix = ticket ? String(fields(ticket).id) : artifact.logicalId.split(':').at(-1)
  return `${suffix} ${artifact.kind === 'assessment' ? 'eligibility' : 'reply'}`
}
export function artifactSummary(artifact: Artifact): string {
  const body = fields(artifact)
  if (artifact.kind === 'source') return String(body.text)
  if (artifact.kind === 'case')
    return body.daysSinceDelivery !== undefined
      ? `${body.daysSinceDelivery} days since delivery · ${body.reason}`
      : String(body.message)
  if (artifact.kind === 'policy-facts')
    return body.status === 'supported'
      ? `${body.returnWindowDays}-day return window`
      : String(body.reason)
  return String(body.text ?? body.explanation ?? '')
}
export function humanStatus(artifact: Artifact) {
  return artifact.needsReview
    ? 'Review required'
    : artifact.status === 'released'
      ? 'Reviewed'
      : artifact.status.charAt(0).toUpperCase() + artifact.status.slice(1)
}
export function time(value: number) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
export function duration(start: number, end?: number) {
  return end === undefined ? 'In progress' : `${((end - start) / 1_000).toFixed(1)}s`
}

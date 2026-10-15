import { CheckCircle2, Clock3, LoaderCircle, TriangleAlert } from 'lucide-react'
import type { WorkspaceSnapshot } from '../../shared/contracts'
import { duration, time } from '../presentation'
import { Badge } from './ui'

export function RunTimeline({
  snapshot,
  compact = false,
}: {
  snapshot: WorkspaceSnapshot
  compact?: boolean
}) {
  const runs = [...snapshot.runs].sort((a, b) => b.createdAt - a.createdAt)
  return (
    <section className="panel run-panel">
      <div className="section-heading">
        <h2>{compact ? 'Latest activity' : 'Execution history'}</h2>
        <span className="quiet-label">{snapshot.runs.length} runs</span>
      </div>
      {!runs.length && (
        <div className="empty-row">
          <Clock3 size={22} aria-hidden="true" />
          <p>Your first build will record real steps, input reads and outputs here.</p>
        </div>
      )}
      {(compact ? runs.slice(0, 2) : runs).map((run) => {
        const steps = snapshot.steps.filter((step) => step.runId === run.id)
        const finished = steps.filter((step) => step.status === 'succeeded').length
        const active = ['queued', 'running'].includes(run.status)
        const Icon = active
          ? LoaderCircle
          : run.status === 'succeeded'
            ? CheckCircle2
            : TriangleAlert
        return (
          <details className="run-item" key={run.id} open={active || !compact}>
            <summary>
              <span className={`run-icon run-${run.status}`}>
                <Icon size={18} className={active ? 'spin' : ''} aria-hidden="true" />
              </span>
              <span className="run-title">
                <strong>{run.type === 'build' ? 'Support-agent build' : 'Selective repair'}</strong>
                <span>
                  {time(run.createdAt)} · {run.modelCalls} model calls ·{' '}
                  {duration(run.createdAt, run.completedAt)}
                </span>
              </span>
              <Badge tone={active ? 'blue' : run.status === 'succeeded' ? 'green' : 'amber'}>
                {run.status}
              </Badge>
            </summary>
            <div className="run-detail">
              <p className="mono break">{run.id}</p>
              {run.errorCode && (
                <p className="inline-error">
                  {run.errorCode.replaceAll('_', ' ')}. This run did not publish a completed
                  replacement set.
                </p>
              )}
              <p className="muted">
                {finished} of {steps.length} recorded steps completed.
              </p>
              <div className="step-list">
                {[...steps]
                  .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0))
                  .map((step) => (
                    <div key={step.id}>
                      <span>
                        <strong>{step.stage}</strong>
                        <small>{step.attempts} inference attempts</small>
                      </span>
                      <span className="step-measurement">
                        {step.inputTokens === undefined
                          ? 'Tokens unavailable'
                          : `${step.inputTokens} in / ${step.outputTokens ?? '—'} out`}
                        <small>{step.status}</small>
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </details>
        )
      })}
    </section>
  )
}

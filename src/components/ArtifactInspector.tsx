import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, ScanLine, X } from 'lucide-react'
import { impactReportSchema, sourceNotesSchema, type Artifact, type WorkspaceSnapshot } from '../../shared/contracts'
import { request } from '../api'
import { artifactSummary, artifactTitle, fields, humanStatus } from '../presentation'
import { Badge } from './ui'

export function ArtifactInspector({
  artifact,
  snapshot,
  recorded,
  busy,
  onClose,
  onSelect,
  onRelease,
}: {
  artifact: Artifact
  snapshot: WorkspaceSnapshot
  recorded: boolean
  busy: boolean
  onClose: () => void
  onSelect: (id: string) => void
  onRelease: (id: string) => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus({ preventScroll: window.innerWidth > 1180 })
  }, [artifact.id])
  const [audit, setAudit] = useState<{ forId: string; text: string; paths: string[][] } | null>(
    null,
  )
  const previousId = snapshot.edges.find(
    (edge) => edge.type === 'SUPERSEDES' && edge.from === artifact.id,
  )?.to
  const previous = snapshot.artifacts.find((item) => item.id === previousId)
  const body = fields(artifact)
  const citations = Array.isArray(body.citations) ? [...new Set(body.citations.filter((id): id is string => typeof id === 'string'))] : []
  const quotes = artifact.kind === 'source-notes' ? sourceNotesSchema.parse(artifact.body).quotes : []
  return (
    <section className="panel inspector" aria-label="Artifact details">
      <div className="section-heading">
        <div>
          <p className="eyebrow">VERSION INSPECTOR</p>
          <h2 ref={heading} tabIndex={-1}>
            {artifactTitle(artifact, snapshot)}
          </h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close artifact details">
          <X size={18} />
        </button>
      </div>
      <div className="inspector-status">
        <Badge
          tone={
            artifact.status === 'stale' || artifact.needsReview
              ? 'amber'
              : artifact.status === 'superseded'
                ? 'neutral'
                : 'blue'
          }
        >
          {humanStatus(artifact)}
        </Badge>
        <span className="mono">
          v{artifact.version} · {artifact.kind}
        </span>
      </div>
      <p className="artifact-content">{artifactSummary(artifact)}</p>
      {body.evidenceQuote && (
        <blockquote>
          <span>Verified source quote</span>
          {String(body.evidenceQuote)}
          <small>
            Exact span {String(body.evidenceStart)}–{String(body.evidenceEnd)}
          </small>
        </blockquote>
      )}
      {body.decision && (
        <p className="decision-line">
          Recorded decision <strong>{String(body.decision)}</strong>
        </p>
      )}
      <dl className="metadata">
        <div>
          <dt>Version ID</dt>
          <dd className="mono">{artifact.id}</dd>
        </div>
        <div>
          <dt>Content SHA-256</dt>
          <dd className="mono">{artifact.contentHash}</dd>
        </div>
        <div>
          <dt>Work session</dt>
          <dd>
            {snapshot.sessions.find((session) => session.id === artifact.sessionId)?.label ??
              'Source input'}
          </dd>
        </div>
      </dl>
      {previous && (
        <details className="previous-version">
          <summary>Compare previous version · v{previous.version}</summary>
          <p>{artifactSummary(previous)}</p>
          <button className="text-button" onClick={() => onSelect(previous.id)}>
            Inspect previous version <ArrowRight size={14} aria-hidden="true" />
          </button>
        </details>
      )}
      {artifact.kind === 'source-notes' && <section className="source-evidence"><h3>Exact source quotations</h3>{quotes.map((quote,index) => <blockquote key={index}><p>{quote.text}</p><small>Characters {quote.start}–{quote.end} in the recorded source version</small></blockquote>)}</section>}
      {citations.length > 0 && <section aria-label="Cited sources">
        <h3>Cited sources</h3>
        <ul className="input-list citation-list">{citations.map(id => {
          const cited = snapshot.artifacts.find(input => input.id === id)
          return <li key={id}>{cited ? <button onClick={() => onSelect(id)}>
            <span>{artifactTitle(cited, snapshot)}<small className="mono">{id}</small></span>
            <span className="mono">v{cited.version}</span>
            <ArrowRight size={14} aria-hidden="true" />
          </button> : <span className="mono">{id}</span>}</li>
        })}</ul>
      </section>}
      <h3>
        Recorded inputs <span className="count-label">{artifact.inputIds.length}</span>
      </h3>
      {artifact.inputIds.length ? (
        <ul className="input-list">
          {artifact.inputIds.map((id) => {
            const input = snapshot.artifacts.find((a) => a.id === id)!
            return (
              <li key={id}>
                <button onClick={() => onSelect(id)}>
                  {artifactTitle(input, snapshot)}
                  <span className="mono">v{input.version}</span>
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="muted">This is an explicit root input.</p>
      )}
      {artifact.kind === 'source' && !recorded && (
        <button
          className="button button-secondary full-width"
          onClick={async () => {
            try {
              const result = impactReportSchema.parse(
                await request(`/api/artifacts/${encodeURIComponent(artifact.id)}/impact`),
              )
              setAudit({
                forId: artifact.id,
                text: `${result.affected.length} affected current or released artifacts`,
                paths: result.paths,
              })
            } catch (error) {
              setAudit({
                forId: artifact.id,
                text: error instanceof Error ? error.message : 'Impact could not be loaded.',
                paths: [],
              })
            }
          }}
        >
          <ScanLine size={16} aria-hidden="true" />
          Trace impact
        </button>
      )}
      {audit?.forId === artifact.id && (
        <div className="audit-result" role="status">
          <p>{audit.text}</p>
          {audit.paths.map((path) => (
            <p className="path-text" key={path.join(':')}>
              {path
                .map((id) =>
                  artifactTitle(
                    snapshot.artifacts.find((a) => a.id === id)!,
                    snapshot,
                  ),
                )
                .join(' → ')}
            </p>
          ))}
        </div>
      )}
      {artifact.kind === 'reply' && (
        <div className="review-box">
          <p>Operator review is required. This control records an internal review state.</p>
          <button
            className="button button-secondary full-width"
            disabled={
              recorded ||
              busy ||
              !artifact.isCurrent ||
              artifact.status === 'stale' ||
              artifact.needsReview ||
              artifact.status === 'released'
            }
            onClick={() => onRelease(artifact.id)}
          >
            <Check size={16} aria-hidden="true" />
            {artifact.status === 'released' ? 'Reviewed' : 'Mark reviewed'}
          </button>
          {(artifact.status === 'stale' || artifact.needsReview) && (
            <small>Repair recorded evidence before marking this draft reviewed.</small>
          )}
        </div>
      )}
    </section>
  )
}

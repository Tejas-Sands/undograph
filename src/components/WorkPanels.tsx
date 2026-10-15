import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  FileText,
  GitBranch,
  LoaderCircle,
  MessageSquare,
  Play,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react'
import type { Artifact, WorkspaceSnapshot } from '../../shared/contracts'
import { artifactSummary, artifactTitle, fields, humanStatus, time } from '../presentation'
import { Badge } from './ui'

export function Welcome({
  ready,
  busy,
  onEnter,
}: {
  ready: boolean
  busy: boolean
  onEnter: () => void
}) {
  return (
    <section className="welcome-panel">
      <div className="welcome-copy">
        <Badge tone="blue">PERSISTENT AGENT CONTEXT</Badge>
        <h2>
          Sources change.
          <br />
          Good work should survive.
        </h2>
        <p>
          Build support-agent work, correct a mistaken policy, and repair the outputs connected to
          it. Keep independent work exactly as it was.
        </p>
        <div className="welcome-actions">
          <button className="button button-primary" disabled={!ready || busy} onClick={onEnter}>
            {busy ? (
              <LoaderCircle size={17} className="spin" aria-hidden="true" />
            ) : (
              <Play size={17} aria-hidden="true" />
            )}
            Start live workspace
          </button>
          <a className="button button-secondary" href="#/recorded/overview">
            Explore recorded example <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
        <p className="welcome-note">
          <ShieldCheck size={15} aria-hidden="true" />
          Isolated synthetic data. Every reply requires review.
        </p>
      </div>
      <div
        className="welcome-diagram"
        role="img"
        aria-label="A source connects to dependent work while an independent branch is preserved"
      >
        <div className="diagram-source">
          <FileText size={20} aria-hidden="true" />
          <span>Policy source</span>
          <span className="mono">v1 → v2</span>
        </div>
        <div className="diagram-line" />
        <div className="diagram-work">
          <div>
            <GitBranch size={18} aria-hidden="true" />
            <span>Trace dependencies</span>
          </div>
          <ArrowRight size={18} aria-hidden="true" />
          <div>
            <RefreshCw size={18} aria-hidden="true" />
            <span>Repair affected work</span>
          </div>
        </div>
        <div className="diagram-preserved">
          <ShieldCheck size={20} aria-hidden="true" />
          <span>Preserve independent work</span>
          <Check size={17} aria-hidden="true" />
        </div>
      </div>
      <div className="welcome-bottom">
        <span>
          <GitBranch size={17} aria-hidden="true" />
          Versioned dependencies
        </span>
        <span>
          <CheckCircle2 size={17} aria-hidden="true" />
          Guarded publication
        </span>
        <span>
          <ShieldCheck size={17} aria-hidden="true" />
          Recoverable execution
        </span>
      </div>
    </section>
  )
}

export function CaseQueue({
  snapshot,
  onSelect,
}: {
  snapshot: WorkspaceSnapshot
  onSelect: (id: string) => void
}) {
  const cases = snapshot.artifacts.filter(
    (artifact) => artifact.isCurrent && artifact.kind === 'case',
  )
  return (
    <section className="panel case-panel">
      <div className="section-heading">
        <div>
          <h2>Support work</h2>
          <p>One policy correction. Two agent contexts.</p>
        </div>
        <Badge>{cases.length} cases</Badge>
      </div>
      <div className="case-table-header">
        <span>CASE / REQUEST</span>
        <span>RECORDED DECISION</span>
      </div>
      {cases.map((ticket) => (
        <CaseRow key={ticket.id} ticket={ticket} snapshot={snapshot} onSelect={onSelect} />
      ))}
      <div className="panel-bottom">
        <ShieldCheck size={15} aria-hidden="true" />
        All replies remain inside this synthetic workspace.
      </div>
    </section>
  )
}

function CaseRow({
  ticket,
  snapshot,
  onSelect,
}: {
  ticket: Artifact
  snapshot: WorkspaceSnapshot
  onSelect: (id: string) => void
}) {
  const assessment = snapshot.artifacts.find(
    (a) => a.isCurrent && a.kind === 'assessment' && a.inputIds.includes(ticket.id),
  )
  const reply = snapshot.artifacts.find(
    (a) => a.isCurrent && a.kind === 'reply' && a.inputIds.includes(ticket.id),
  )
  const body = fields(ticket)
  const decision = assessment
    ? String(fields(assessment).decision)
    : reply
      ? 'Account help'
      : 'Awaiting build'
  const stale = assessment?.status === 'stale' || reply?.status === 'stale'
  const review = assessment?.needsReview || reply?.needsReview
  return (
    <button className="case-row" onClick={() => onSelect(reply?.id ?? assessment?.id ?? ticket.id)}>
      <span className={`case-icon ${body.topic ? 'case-account' : ''}`}>
        <MessageSquare size={18} aria-hidden="true" />
      </span>
      <span className="case-description">
        <strong>
          {String(body.id)} <span>{body.topic ? 'Account access' : 'Change-of-mind return'}</span>
        </strong>
        <small>
          {body.daysSinceDelivery !== undefined
            ? `${body.daysSinceDelivery} days since delivery`
            : 'Password-reset request'}
        </small>
      </span>
      <span className="case-decision">
        <Badge
          tone={
            stale || review
              ? 'amber'
              : decision === 'eligible' || decision === 'Account help'
                ? 'green'
                : decision === 'ineligible'
                  ? 'neutral'
                  : 'blue'
          }
        >
          {stale ? 'Stale' : review ? 'Review required' : decision}
        </Badge>
        <ArrowUpRight size={15} aria-hidden="true" />
      </span>
    </button>
  )
}

export function RepliesPanel({
  snapshot,
  selectedId,
  onSelect,
}: {
  snapshot: WorkspaceSnapshot
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const replies = snapshot.artifacts.filter(
    (artifact) => artifact.isCurrent && artifact.kind === 'reply',
  )
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>Pending and reviewed replies</h2>
          <p>Inspect evidence before recording an internal review.</p>
        </div>
        <MessageSquare size={19} aria-hidden="true" />
      </div>
      {replies.length ? (
        <div className="reply-list">
          {replies.map((artifact) => (
            <button
              className={`reply-card ${selectedId === artifact.id ? 'is-selected' : ''}`}
              key={artifact.id}
              onClick={() => onSelect(artifact.id)}
            >
              <div>
                <strong>{artifactTitle(artifact, snapshot)}</strong>
                <Badge
                  tone={artifact.status === 'stale' || artifact.needsReview ? 'amber' : 'blue'}
                >
                  {humanStatus(artifact)}
                </Badge>
              </div>
              <p>{artifactSummary(artifact)}</p>
              <div className="reply-card-footer">
                <span className="decision-label">{String(fields(artifact).decision)}</span>
                <span className="mono">v{artifact.version}</span>
                <span>
                  Inspect evidence <ArrowUpRight size={13} aria-hidden="true" />
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-row">
          <MessageSquare size={24} aria-hidden="true" />
          <p>Build agent work to create replies from actual recorded inputs.</p>
        </div>
      )}
    </section>
  )
}

export function SessionsPanel({
  snapshot,
  disabled,
  onCreate,
}: {
  snapshot: WorkspaceSnapshot
  disabled: boolean
  onCreate: () => void
}) {
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>Persisted work sessions</h2>
          <p>Separate policy and reply contexts.</p>
        </div>
        <button className="button button-secondary" disabled={disabled} onClick={onCreate}>
          New session
        </button>
      </div>
      {snapshot.sessions.length ? (
        <div className="session-list">
          {[...snapshot.sessions]
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((session) => {
              const artifacts = snapshot.artifacts.filter((a) => a.sessionId === session.id)
              return (
                <article key={session.id}>
                  <span className="tile-icon">
                    <Users size={19} aria-hidden="true" />
                  </span>
                  <div>
                    <h3>{session.label}</h3>
                    <p>
                      {time(session.createdAt)} · {artifacts.length} recorded outputs
                    </p>
                    <code>{session.id}</code>
                  </div>
                  <Badge>{artifacts.length ? 'Recorded work' : 'Empty session'}</Badge>
                </article>
              )
            })}
        </div>
      ) : (
        <div className="empty-row">
          <Users size={24} aria-hidden="true" />
          <p>Your first build creates the two agent work sessions.</p>
        </div>
      )}
    </section>
  )
}

export function HistoryPanel({
  snapshot,
  onSelect,
}: {
  snapshot: WorkspaceSnapshot
  onSelect: (id: string) => void
}) {
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Source corrections</h2>
        <span className="quiet-label">{snapshot.changes.length} changes</span>
      </div>
      {snapshot.changes.length ? (
        [...snapshot.changes]
          .sort((a, b) => b.revision - a.revision)
          .map((change) => (
            <div className="change-row" key={change.id}>
              <span className="tile-icon">
                <FileText size={18} aria-hidden="true" />
              </span>
              <div>
                <h3>Policy corrected · revision {change.revision}</h3>
                <p>{change.reason}</p>
                <button className="text-button" onClick={() => onSelect(change.newSourceId)}>
                  Inspect new source <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>
              <span className="quiet-label">{time(change.createdAt)}</span>
            </div>
          ))
      ) : (
        <p className="empty-message">Source corrections and their reasons will appear here.</p>
      )}
    </section>
  )
}

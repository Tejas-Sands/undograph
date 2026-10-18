import { useState } from 'react'
import { ArrowRight, FilePenLine, FileText, ShieldCheck } from 'lucide-react'
import type { Artifact } from '../../shared/contracts'
import type { WorkspaceController } from '../useWorkspace'
import { artifactSummary, fields } from '../presentation'
import { Badge, Dialog } from './ui'

export function SourcePanel({
  controller,
  recorded,
  onSelect,
}: {
  controller: WorkspaceController
  recorded: boolean
  onSelect: (id: string) => void
}) {
  const snapshot = controller.snapshot!
  const [editing, setEditing] = useState<Artifact | null>(null)
  const sources = snapshot.artifacts.filter(
    (artifact) => artifact.kind === 'source' && artifact.isCurrent,
  )
  return (
    <section className="source-list" aria-label="Current sources">
      {sources.map((source) => (
        <article className="panel source-card" key={source.id}>
          <div className="section-heading">
            <div className="section-title">
              <span className="tile-icon">
                <FileText size={20} aria-hidden="true" />
              </span>
              <div>
                <h2>{String(fields(source).title)}</h2>
                <p>
                  Source of truth <span className="inline-dot">·</span> Version {source.version}
                </p>
              </div>
            </div>
            <Badge tone="green">Current</Badge>
          </div>
          <div className="source-text">{artifactSummary(source)}</div>
          <div className="source-footer">
            <button className="text-button" onClick={() => onSelect(source.id)}>
              Inspect version <ArrowRight size={15} aria-hidden="true" />
            </button>
            {['return-policy', 'document'].includes(String(fields(source).category)) ? (
              <button
                className="button button-secondary"
                disabled={recorded || controller.busy || !controller.ready}
                onClick={() => setEditing(source)}
              >
                <FilePenLine size={16} aria-hidden="true" />
                {fields(source).category === 'document' ? 'Correct source text' : 'Correct return window'}
              </button>
            ) : (
              <span className="quiet-label">
                <ShieldCheck size={15} aria-hidden="true" />
                Independent source
              </span>
            )}
          </div>
        </article>
      ))}
      <p className="section-note">
        Corrections create a new immutable source version. The previous version and its recorded
        dependencies remain inspectable.
      </p>
      {editing && (
        <CorrectionDialog
          source={editing}
          controller={controller}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  )
}

function CorrectionDialog({
  source,
  controller,
  onClose,
}: {
  source: Artifact
  controller: WorkspaceController
  onClose: () => void
}) {
  const [days, setDays] = useState(
    () => String(fields(source).text).match(/within (\d+) days/)?.[1] ?? '',
  )
  const [reason, setReason] = useState('')
  const [text, setText] = useState(String(fields(source).text))
  const document = fields(source).category === 'document'
  const [revision] = useState(controller.snapshot!.workspace.revision)
  return (
    <Dialog title={document ? 'Correct source text' : 'Correct the return policy'} onClose={onClose}>
      <p className="modal-description">
        Save a new source version. Dependent pending work becomes stale and requires repair before
        review.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          const result = await controller.correct({
            sourceArtifactId: source.id,
            expectedRevision: revision,
            ...(document ? { text } : { returnWindowDays: Number(days) }),
            reason,
          })
          if (result !== undefined) onClose()
        }}
      >
        {document ? <><label htmlFor="source-correction-text">Source text</label><textarea id="source-correction-text" autoFocus required maxLength={2000} rows={8} value={text} onChange={event => setText(event.target.value)} /></> : <><label htmlFor="return-days">Return window (days)</label>
        <input
          autoFocus
          id="return-days"
          type="number"
          min="1"
          max="365"
          required
          value={days}
          onChange={(event) => setDays(event.target.value)}
        /></>}
        <label htmlFor="correction-reason">Reason for correction</label>
        <textarea
          id="correction-reason"
          rows={3}
          required
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="What did the operator verify?"
        />
        {controller.error && (
          <p className="inline-error" role="alert">
            {controller.error.message}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button button-primary" disabled={controller.busy}>
            {controller.busy ? 'Saving…' : 'Save correction'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

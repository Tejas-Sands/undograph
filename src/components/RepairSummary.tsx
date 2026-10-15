import { ArrowUpRight, ShieldCheck } from 'lucide-react'
import type { WorkspaceSnapshot } from '../../shared/contracts'
import { Badge } from './ui'

export function RepairSummary({
  snapshot,
  onSelect,
}: {
  snapshot: WorkspaceSnapshot
  onSelect: (id: string) => void
}) {
  const report = [...snapshot.reports].sort((a, b) => b.createdAt - a.createdAt)[0]
  if (!report) return null
  return (
    <section className="panel repair-summary">
      <div className="section-heading">
        <div className="section-title">
          <ShieldCheck size={20} aria-hidden="true" />
          <h2>Repair verified</h2>
        </div>
        <Badge tone="green">Complete</Badge>
      </div>
      <p>
        <strong>{report.repairedLogicalIds.length} artifact versions rebuilt.</strong> The complete
        replacement set was published at source revision {report.revision}.
      </p>
      {report.preserved.map((artifact) => (
        <button className="preserved-card" key={artifact.id} onClick={() => onSelect(artifact.id)}>
          <span className="preserved-check">
            <ShieldCheck size={20} aria-hidden="true" />
          </span>
          <span>
            <strong>Independent reply preserved</strong>
            <small>Same version ID and content hash</small>
            <code>{artifact.contentHash.slice(0, 16)}…</code>
          </span>
          <ArrowUpRight size={17} aria-hidden="true" />
        </button>
      ))}
    </section>
  )
}

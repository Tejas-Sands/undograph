import { lazy, Suspense, useCallback, useRef, useState, useSyncExternalStore } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  Download,
  GitBranch,
  Layers3,
  LoaderCircle,
  Play,
  RefreshCw,
  TriangleAlert,
  Users,
  X,
} from 'lucide-react'
import { AppShell } from './components/AppShell'
import { views } from './navigation'
import { ArtifactInspector } from './components/ArtifactInspector'
import { RepairSummary } from './components/RepairSummary'
import { RunTimeline } from './components/RunTimeline'
import { SourcePanel } from './components/SourcePanel'
import {
  CaseQueue,
  HistoryPanel,
  RepliesPanel,
  SessionsPanel,
  Welcome,
} from './components/WorkPanels'
import { Badge, Dialog } from './components/ui'
import { useWorkspace } from './useWorkspace'

const LineageGraph = lazy(() => import('./components/LineageGraph'))
const subscribe = (update: () => void) => {
  window.addEventListener('hashchange', update)
  return () => window.removeEventListener('hashchange', update)
}
const readHash = () => window.location.hash

export default function App() {
  const hash = useSyncExternalStore(subscribe, readHash)
  const recorded = hash.startsWith('#/recorded/')
  const view = views.find((item) => item.id === hash.split('/').at(-1)) ?? views[0]
  const controller = useWorkspace(recorded)
  const { snapshot, loading, busy, activeRun, error } = controller
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectionTrigger = useRef<HTMLElement | null>(null)
  const selectArtifact = useCallback(
    (id: string) => {
      if (id === selectedId) return
      if (!document.querySelector('.inspector')?.contains(document.activeElement))
        selectionTrigger.current = document.activeElement as HTMLElement
      setSelectedId(id)
    },
    [selectedId],
  )
  function closeInspector() {
    setSelectedId(null)
    const trigger = selectionTrigger.current
    if (trigger?.isConnected) trigger.focus()
    else document.querySelector<HTMLElement>('.page-heading h1')?.focus()
  }
  const [resetting, setResetting] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [newSession, setNewSession] = useState(false)
  const [sessionLabel, setSessionLabel] = useState('')
  const current = snapshot?.artifacts.filter((artifact) => artifact.isCurrent) ?? []
  const outputs = current.filter((artifact) => !['source', 'case'].includes(artifact.kind))
  const stale = current.filter((artifact) => artifact.status === 'stale')
  const selected = snapshot?.artifacts.find((artifact) => artifact.id === selectedId)
  const latestRun = snapshot?.runs.reduce<(typeof snapshot.runs)[number] | undefined>(
    (latest, run) => (!latest || run.createdAt > latest.createdAt ? run : latest),
    undefined,
  )
  const disabled = busy || !controller.ready || recorded

  return (
    <AppShell
      view={view.id}
      recorded={recorded}
      hasWorkspace={Boolean(snapshot)}
      onReset={() => {
        setConfirmation('')
        setResetting(true)
      }}
    >
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {snapshot
          ? `${recorded ? 'Recorded snapshot. ' : ''}${latestRun ? `${latestRun.type} run ${latestRun.status}. ` : ''}${outputs.length} current outputs. ${stale.length} pending artifacts require repair.`
          : ''}
      </p>
      {recorded && (
        <div className="recorded-banner">
          <span>
            <Play size={15} aria-hidden="true" />
            <strong>Recorded walkthrough · Read only</strong>
            <span>Frozen synthetic example. Live inference is separate.</span>
          </span>
          <a href={`#/${view.id}`}>
            Open live mode <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
      )}
      <div className="page-heading">
        <div>
          <p className="eyebrow">{recorded ? 'EXPLORE THE SCENARIO' : 'AGENT OPERATIONS'}</p>
          <h1 tabIndex={-1}>{view.title}</h1>
          <p>Trace what changed. Repair what depends on it.</p>
        </div>
        <div className="page-actions">
          {!recorded && (
            <button
              className="icon-button"
              aria-label="Refresh workspace"
              disabled={busy}
              onClick={() => void controller.refresh()}
            >
              <RefreshCw size={17} className={loading ? 'spin' : ''} />
            </button>
          )}
          {snapshot && (
            <button
              className="button button-secondary"
              onClick={() => void controller.exportAudit()}
            >
              <Download size={16} aria-hidden="true" />
              Export audit
            </button>
          )}
          {snapshot &&
            !recorded &&
            (controller.canRetryLaunch ? (
              <button
                className="button button-primary"
                disabled={busy || !controller.ready}
                onClick={() => void controller.retryLaunch()}
              >
                Launch saved run
              </button>
            ) : activeRun ? (
              <Badge tone="blue">
                {activeRun.type === 'build' ? 'Building agent work' : 'Repairing affected work'}
              </Badge>
            ) : outputs.length === 0 ? (
              <button
                className="button button-primary"
                disabled={disabled}
                onClick={() => void controller.startRun('build')}
              >
                <Play size={16} aria-hidden="true" />
                Build agent work
              </button>
            ) : stale.length ? (
              <button
                className="button button-primary"
                disabled={disabled}
                onClick={() => void controller.startRun('repair')}
              >
                <RefreshCw size={16} aria-hidden="true" />
                Repair affected work
              </button>
            ) : (
              <Badge tone="green">Work is current</Badge>
            ))}
        </div>
      </div>
      {error && !recorded && (
        <div className="error-banner" role="alert">
          <TriangleAlert size={19} aria-hidden="true" />
          <div>
            <strong>
              {error.code === 'RUN_LAUNCH_PENDING'
                ? 'Run saved. Launch needs another attempt.'
                : 'The action could not be completed.'}
            </strong>
            <p>{error.message}</p>
          </div>
          <button
            className="icon-button"
            aria-label="Dismiss error"
            onClick={controller.clearError}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {recorded && (
        <div className="walkthrough-steps" role="group" aria-label="Recorded scenario stages">
          {(
            [
              { id: 'original', label: '01 Original', description: '30-day policy' },
              { id: 'corrected', label: '02 Corrected', description: '14-day policy' },
              { id: 'repaired', label: '03 Repaired', description: 'Selective rebuild' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              aria-label={item.label}
              aria-pressed={controller.stage === item.id}
              onClick={() => {
                controller.setStage(item.id)
                setSelectedId(null)
              }}
            >
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </div>
      )}
      {!snapshot ? (
        loading ? (
          <div className="loading-state" role="status">
            <LoaderCircle className="spin" size={26} aria-hidden="true" />
            <h2>Opening the workspace</h2>
            <p>Recovering confirmed graph state.</p>
          </div>
        ) : (
          <Welcome busy={busy} ready={controller.ready} onEnter={() => void controller.enter()} />
        )
      ) : (
        <>
          <div className="stats-grid" role="group" aria-label="Persisted workspace counts">
            {[
              {
                label: 'Current outputs',
                value: outputs.length,
                caption: 'Persisted artifact versions',
                icon: Layers3,
                testId: 'current-output-count',
              },
              {
                label: 'Stale work',
                value: stale.length,
                caption: stale.length
                  ? 'Repair required before review'
                  : 'No pending stale artifacts',
                icon: TriangleAlert,
                testId: 'stale-count',
              },
              {
                label: 'Work sessions',
                value: snapshot.sessions.length,
                caption: 'Persisted agent context',
                icon: Users,
                testId: 'session-count',
              },
              {
                label: 'Source revision',
                value: snapshot.workspace.revision,
                caption: 'Guarded workspace revision',
                icon: GitBranch,
                testId: 'revision-count',
              },
            ].map(({ label, value, caption, icon: Icon, testId }) => (
              <div
                className={`stat-card ${testId === 'stale-count' && stale.length ? 'stat-amber' : ''}`}
                key={label}
              >
                <div>
                  <span>{label}</span>
                  <Icon size={17} aria-hidden="true" />
                </div>
                <strong data-testid={testId}>{value}</strong>
                <p>{caption}</p>
              </div>
            ))}
          </div>
          {stale.length > 0 && (
            <div className="stale-banner">
              <TriangleAlert size={21} aria-hidden="true" />
              <div>
                <strong>{stale.length} artifact versions need repair</strong>
                <p>
                  The corrected policy changed recorded inputs. Pending work stays stale until the
                  complete replacement set is published.
                </p>
              </div>
              <a href={recorded ? '#/recorded/sources' : '#/sources'}>
                Review source <ArrowRight size={15} aria-hidden="true" />
              </a>
            </div>
          )}
          <div className="workspace-grid">
            <div className="work-column">
              {view.id === 'overview' && (
                <>
                  <CaseQueue snapshot={snapshot} onSelect={selectArtifact} />
                  {snapshot.reports.length ? (
                    <RepairSummary snapshot={snapshot} onSelect={selectArtifact} />
                  ) : (
                    <section className="next-step-card">
                      <span className="next-step-icon">
                        <GitBranch size={22} aria-hidden="true" />
                      </span>
                      <div>
                        <p className="eyebrow">
                          {activeRun
                            ? 'DURABLE EXECUTION'
                            : outputs.length
                              ? 'NEXT STEP'
                              : 'READY TO BUILD'}
                        </p>
                        <h2>
                          {activeRun
                            ? 'Work continues after this tab closes.'
                            : outputs.length
                              ? 'Correct a source. See the ripple.'
                              : 'Start with actual agent work.'}
                        </h2>
                        <p>
                          {activeRun
                            ? 'Every generated output records the input versions it read. Progress is recovered from the graph.'
                            : outputs.length
                              ? 'Open Sources to correct the return window and trace its recorded dependencies.'
                              : 'The analyst interprets policy, eligibility runs in application code, and the reply agent drafts from recorded evidence.'}
                        </p>
                        {outputs.length > 0 && !activeRun && (
                          <a
                            className="text-button"
                            href={recorded ? '#/recorded/sources' : '#/sources'}
                          >
                            Open sources <ArrowRight size={15} aria-hidden="true" />
                          </a>
                        )}
                      </div>
                    </section>
                  )}
                  <RunTimeline snapshot={snapshot} compact />
                </>
              )}
              {view.id === 'sources' && (
                <SourcePanel
                  controller={controller}
                  recorded={recorded}
                  onSelect={selectArtifact}
                />
              )}
              {view.id === 'replies' && (
                <RepliesPanel
                  snapshot={snapshot}
                  selectedId={selectedId}
                  onSelect={selectArtifact}
                />
              )}
              {view.id === 'sessions' && (
                <>
                  <SessionsPanel
                    snapshot={snapshot}
                    disabled={disabled}
                    onCreate={() => setNewSession(true)}
                  />
                  <RunTimeline snapshot={snapshot} />
                </>
              )}
              {view.id === 'history' && (
                <>
                  <RepairSummary snapshot={snapshot} onSelect={selectArtifact} />
                  <HistoryPanel snapshot={snapshot} onSelect={selectArtifact} />
                  <RunTimeline snapshot={snapshot} />
                </>
              )}
            </div>
            <div className="detail-column">
              {selected && (
                <ArtifactInspector
                  artifact={selected}
                  snapshot={snapshot}
                  recorded={recorded}
                  busy={busy || !controller.ready}
                  onClose={closeInspector}
                  onSelect={selectArtifact}
                  onRelease={(id) => void controller.release(id)}
                />
              )}
              <Suspense
                fallback={
                  <div className="panel graph-loading" role="status">
                    Loading dependency view…
                  </div>
                }
              >
                <LineageGraph
                  snapshot={snapshot}
                  selectedId={selectedId}
                  onSelect={selectArtifact}
                />
              </Suspense>
            </div>
          </div>
        </>
      )}
      {resetting && (
        <Dialog title="Reset this workspace?" onClose={() => setResetting(false)}>
          <p className="modal-description">
            This closes the current workspace and starts fresh with the synthetic inputs. Export
            your audit first to keep a copy.
          </p>
          <form
            onSubmit={async (event) => {
              event.preventDefault()
              if (confirmation === 'RESET') {
                const result = await controller.reset()
                if (result !== undefined) {
                  setSelectedId(null)
                  setResetting(false)
                }
              }
            }}
          >
            <label htmlFor="reset-confirmation">Type RESET to confirm</label>
            <input
              id="reset-confirmation"
              autoFocus
              required
              pattern="RESET"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
            {controller.error && (
              <p className="inline-error" role="alert">
                {controller.error.message}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setResetting(false)}
              >
                Cancel
              </button>
              <button
                className="button button-danger"
                disabled={busy || !controller.ready || confirmation !== 'RESET'}
              >
                Reset workspace
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {newSession && (
        <Dialog title="New work session" onClose={() => setNewSession(false)}>
          <p className="modal-description">
            Create an empty session. It contains no generated work until a run records outputs.
          </p>
          <form
            onSubmit={async (event) => {
              event.preventDefault()
              const result = await controller.addSession(sessionLabel)
              if (result !== undefined) {
                setSessionLabel('')
                setNewSession(false)
              }
            }}
          >
            <label htmlFor="session-label">Session label</label>
            <input
              id="session-label"
              autoFocus
              required
              maxLength={80}
              value={sessionLabel}
              onChange={(event) => setSessionLabel(event.target.value)}
            />
            {controller.error && (
              <p className="inline-error" role="alert">
                {controller.error.message}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setNewSession(false)}
              >
                Cancel
              </button>
              <button className="button button-primary" disabled={busy}>
                Create session
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </AppShell>
  )
}

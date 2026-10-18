import type { ReactNode } from 'react'
import { ArrowUpRight, GitBranch, RotateCcw } from 'lucide-react'
import { views, type View } from '../navigation'

export function AppShell({
  view,
  recorded,
  simulation = false,
  hasWorkspace,
  workspaceName = 'Northstar Goods',
  knowledge = false,
  onReset,
  children,
}: {
  view: View
  recorded: boolean
  simulation?: boolean
  hasWorkspace: boolean
  workspaceName?: string
  knowledge?: boolean
  onReset: () => void
  children: ReactNode
}) {
  return (
    <div className="app-shell">
      <a href="#workspace-main" className="skip-link" onClick={(event) => {
        event.preventDefault()
        document.getElementById('workspace-main')?.focus()
      }}>
        Skip to workspace
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="/"
          aria-label="UndoGraph home"
        >
          <span className="brand-mark">
            <GitBranch size={23} aria-hidden="true" />
          </span>
          UndoGraph<span className="brand-beta">BETA</span>
        </a>
        <div className="workspace-switch">
          <span className="store-avatar">{workspaceName.slice(0,1)}</span>
          <div>
            <strong>{workspaceName}</strong>
            <span>{knowledge ? 'Sources and questions' : 'Synthetic support workspace'}</span>
          </div>
        </div>
        <p className="nav-caption">WORKSPACE</p>
        <nav aria-label="Workspace">
          {views.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#/${simulation ? 'simulation/' : recorded ? 'recorded/' : ''}${id}`}
              aria-current={view === id ? 'page' : undefined}
            >
              <Icon size={19} aria-hidden="true" />
              <span>{knowledge && id === 'replies' ? 'Answers' : label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <GitBranch size={18} aria-hidden="true" />
            <p>
              Context changes.
              <br />
              <strong>Keep the right work.</strong>
            </p>
          </div>
          <a
            className="repo-link"
            href="https://github.com/Tejas-Sands/undograph"
            target="_blank"
            rel="noreferrer"
          >
            Project repository <ArrowUpRight size={14} aria-hidden="true" />
          </a>
          {hasWorkspace && !recorded && (
            <button className="reset-link" onClick={onReset}>
              <RotateCcw size={15} aria-hidden="true" />
              Reset workspace
            </button>
          )}
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <span className="breadcrumb">
            Workspace <span>/</span> <strong>{workspaceName}</strong>
          </span>
          <div className="topbar-right">
            <span className={`mode-dot ${recorded ? 'mode-recorded' : ''}`} />
            {simulation ? 'Simulation · Read only' : recorded ? 'Recorded · Read only' : 'Live workspace'}
            {hasWorkspace && !recorded && (
              <button
                className="icon-button mobile-reset"
                onClick={onReset}
                aria-label="Reset workspace"
              >
                <RotateCcw size={15} />
              </button>
            )}
            <span className="top-avatar" aria-hidden="true">
              {workspaceName.slice(0,1)}
            </span>
          </div>
        </header>
        <main id="workspace-main" className="main-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="app-footer">
          <span>UndoGraph · {knowledge ? 'Answers require internal review.' : 'Synthetic data. Internal review only.'}</span>
          <span>
            Dependency graph powered by <strong>FalkorDB</strong>
          </span>
        </footer>
      </div>
    </div>
  )
}

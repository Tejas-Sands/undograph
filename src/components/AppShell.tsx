import type { ReactNode } from 'react'
import { ArrowUpRight, GitBranch, RotateCcw } from 'lucide-react'
import { views, type View } from '../navigation'

export function AppShell({
  view,
  recorded,
  hasWorkspace,
  onReset,
  children,
}: {
  view: View
  recorded: boolean
  hasWorkspace: boolean
  onReset: () => void
  children: ReactNode
}) {
  return (
    <div className="app-shell">
      <a href="#workspace-main" className="skip-link">
        Skip to workspace
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href={recorded ? '#/recorded/overview' : '#/overview'}
          aria-label="UndoGraph overview"
        >
          <span className="brand-mark">
            <GitBranch size={23} aria-hidden="true" />
          </span>
          UndoGraph<span className="brand-beta">BETA</span>
        </a>
        <div className="workspace-switch">
          <span className="store-avatar">N</span>
          <div>
            <strong>Northstar Goods</strong>
            <span>Synthetic support workspace</span>
          </div>
        </div>
        <p className="nav-caption">WORKSPACE</p>
        <nav aria-label="Workspace">
          {views.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#/${recorded ? 'recorded/' : ''}${id}`}
              aria-current={view === id ? 'page' : undefined}
            >
              <Icon size={19} aria-hidden="true" />
              <span>{label}</span>
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
            Workspace <span>/</span> <strong>Northstar Goods</strong>
          </span>
          <div className="topbar-right">
            <span className={`mode-dot ${recorded ? 'mode-recorded' : ''}`} />
            {recorded ? 'Recorded · Read only' : 'Live workspace'}
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
              N
            </span>
          </div>
        </header>
        <main id="workspace-main" className="main-content">
          {children}
        </main>
        <footer className="app-footer">
          <span>UndoGraph · Synthetic data. Internal review only.</span>
          <span>
            Dependency graph powered by <strong>FalkorDB</strong>
          </span>
        </footer>
      </div>
    </div>
  )
}

import { Component, useSyncExternalStore, type ReactNode } from 'react'
import { LandingPage } from './LandingPage'
import Workspace from './App'
import './simulation.css'

const subscribe = (update: () => void) => {
  window.addEventListener('hashchange', update)
  return () => window.removeEventListener('hashchange', update)
}
const readHash = () => window.location.hash

export function Root() {
  const hash = useSyncExternalStore(subscribe, readHash)
  const mode = hash.startsWith('#/simulation/') ? 'simulation' : hash.startsWith('#/recorded/') ? 'recorded' : 'live'
  return (
    <>
      <WorkspaceBoundary key={mode}>
        {!hash.startsWith('#/') && hash !== '#workspace-main' ? <LandingPage /> : <Workspace />}
      </WorkspaceBoundary>
      {mode !== 'simulation' && <a className="simulation-launcher" href="#/simulation/overview" aria-label="Open simulation">◉ <span>Simulation</span></a>}
    </>
  )
}

class WorkspaceBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <main className="entry-loading" role="alert">
      <h1>This view could not be opened</h1>
      <p>Reload the page to download a fresh copy of the demo.</p>
      <button className="button button-primary" onClick={() => window.location.reload()}>Reload UndoGraph</button>
    </main> : this.props.children
  }
}

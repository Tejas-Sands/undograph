import { lazy, Suspense, useSyncExternalStore } from 'react'
import { LandingPage } from './LandingPage'

const Workspace = lazy(() => import('./App'))
const subscribe = (update: () => void) => {
  window.addEventListener('hashchange', update)
  return () => window.removeEventListener('hashchange', update)
}
const readHash = () => window.location.hash

export function Root() {
  const hash = useSyncExternalStore(subscribe, readHash)
  if (!hash.startsWith('#/') && hash !== '#workspace-main') return <LandingPage />
  return (
    <Suspense fallback={<p className="entry-loading" role="status">Opening UndoGraph…</p>}>
      <Workspace />
    </Suspense>
  )
}

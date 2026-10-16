import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react'
import type { WorkspaceSnapshot } from '../../shared/contracts'
import { simulationSteps } from '../simulation'

export function SimulationGuide({ step, snapshot, onStep }: { step: number; snapshot: WorkspaceSnapshot; onStep: (step: number) => void }) {
  const item = simulationSteps[step]
  const preserved = snapshot.reports[0]?.preserved[0]
  return <section className="simulation-guide" aria-label="Guided simulation">
    <div className="simulation-progress" aria-label={`Step ${step + 1} of ${simulationSteps.length}`}>
      {simulationSteps.map((entry, index) => <button key={entry.title} aria-label={`Step ${index + 1}: ${entry.title}`} aria-current={step === index ? 'step' : undefined} onClick={() => onStep(index)}>{index + 1}</button>)}
      <span>GUIDED SIMULATION · {step + 1} / {simulationSteps.length}</span>
    </div>
    <h2 tabIndex={-1}>{item.title}</h2>
    <p>{item.text}</p>
    {step === 2 && <button className="button button-secondary" disabled>Mark stale reply reviewed</button>}
    {step === 4 && preserved && <dl className="simulation-evidence">
      <dt>Preserved version ID</dt><dd data-testid="preserved-version">{preserved.id}</dd>
      <dt>Preserved SHA-256</dt><dd data-testid="preserved-hash">{preserved.contentHash}</dd>
    </dl>}
    <div className="simulation-controls">
      <button className="button button-secondary" disabled={step === 0} onClick={() => onStep(step - 1)}><ArrowLeft size={15} aria-hidden="true" /> Previous</button>
      {step < simulationSteps.length - 1 ? <button className="button button-primary" onClick={() => onStep(step + 1)}>Next step <ArrowRight size={15} aria-hidden="true" /></button> : <button className="button button-primary" onClick={() => onStep(0)}><RotateCcw size={15} aria-hidden="true" /> Restart simulation</button>}
    </div>
  </section>
}

import { useState } from 'react'
import {
  ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, CodeXml,
  FileText, GitBranch, Layers3, LockKeyhole, MessageSquare, RotateCcw, ShieldCheck,
} from 'lucide-react'
import './landing.css'

const repository = 'https://github.com/Tejas-Sands/undograph'
const stages = [
  { name: 'Original', detail: 'Trace the original evidence.' },
  { name: 'Correct', detail: 'Change the source. See the impact.' },
  { name: 'Repair', detail: 'Rebuild only the affected chain.' },
] as const

function CorrectionExample() {
  const [stage, setStage] = useState(0)
  const corrected = stage > 0
  const repaired = stage === 2
  const status = stage === 1 ? 'stale' : repaired ? 'repaired' : 'current'

  return (
    <section className="lp-example lp-container" aria-label="Interactive correction example">
      <div className="lp-example-toolbar">
        <div><GitBranch size={18} aria-hidden="true" /><strong>Dependency explorer</strong><span>/</span><span>Northstar Goods</span></div>
        <span className="lp-example-mode"><span /> Interactive illustration</span>
      </div>
      <div className="lp-example-body">
        <aside className="lp-example-controls" aria-label="Explore the correction">
          <p className="lp-kicker">ONE SOURCE. THREE STATES.</p>
          <div className="lp-stage-picker" role="group" aria-label="Illustration stages">
            {stages.map(({ name, detail }, index) => (
              <button key={name} aria-label={`${index + 1}. ${name}`} aria-pressed={stage === index} onClick={() => setStage(index)}>
                <span className="lp-stage-number">0{index + 1}</span>
                <span><strong>{name}</strong><span>{detail}</span></span>
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="lp-example-hint"><ArrowUpRight size={17} aria-hidden="true" /><p>Choose a state to follow the same work through a correction.</p></div>
          <a href="#/recorded/overview">Inspect the full walkthrough <ArrowUpRight size={14} aria-hidden="true" /></a>
        </aside>
        <div className={`lp-canvas lp-canvas-${status}`}>
          <div className="lp-canvas-heading"><span>RETURNS POLICY / DEPENDENCY PATH</span><span className={`lp-canvas-state lp-state-${status}`}>{stage === 1 ? 'Correction applied' : repaired ? 'Repair complete' : 'Original evidence'}</span></div>
          <div className="lp-flow">
            <div className={`lp-flow-node lp-source ${corrected ? 'lp-source-corrected' : ''}`}>
              <span className="lp-node-label"><FileText size={14} aria-hidden="true" /> SOURCE <span>{corrected ? 'v2' : 'v1'}</span></span>
              <strong>Returns policy</strong>
              <div className="lp-source-value">
                {corrected && <><s aria-hidden="true">30</s><span className="sr-only">Previously 30 days. Now </span></>}
                <strong>{corrected ? '14' : '30'} days</strong>
                {corrected && <span className="lp-changed-tag">Changed</span>}
              </div>
            </div>
            <div className={`lp-flow-node lp-facts lp-node-${status}`}>
              <span className="lp-node-label"><Layers3 size={14} aria-hidden="true" /> FACTS <span>{repaired ? 'v2' : 'v1'}</span></span>
              <strong>{repaired ? '14' : '30'}-day window</strong>
              <span className="lp-node-state">{stage === 1 ? 'Stale evidence' : 'Policy extracted'}</span>
              <svg className="lp-branch lp-branch-desktop" viewBox="0 0 24 228" preserveAspectRatio="none" aria-hidden="true"><path d="M0 114H12V50H24M12 114V178H24" /></svg>
              <svg className="lp-branch lp-branch-mobile" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><path d="M50 0V12H24V24M50 12H76V24" /></svg>
            </div>
            {['R-021', 'R-007'].map((id, index) => (
              <div key={id} className={`lp-flow-node lp-assessment lp-assessment-${index} lp-node-${status}`}>
                <span className="lp-node-label">ASSESSMENT <span>{repaired ? 'v2' : 'v1'}</span></span>
                <strong>{id} <span>/ {index === 0 ? '21' : '7'} days</span></strong>
                <span className="lp-node-state">{stage === 1 ? 'Needs repair' : 'Eligibility checked'}</span>
              </div>
            ))}
            {['R-021', 'R-007'].map((id, index) => (
              <div key={id} className={`lp-flow-node lp-reply lp-reply-${index} lp-node-${status}`}>
                <span className="lp-node-label"><MessageSquare size={13} aria-hidden="true" /> {id} REPLY <span>{repaired ? 'v2' : 'v1'}</span></span>
                <strong>{stage === 1 ? 'Needs repair' : repaired && index === 0 ? 'Not eligible' : 'Eligible'}</strong>
                <span className="lp-node-state">{stage === 1 ? 'Stale draft' : 'Draft for review'}</span>
              </div>
            ))}
          </div>
          <div className="lp-independent">
            <span className="lp-independent-source"><ShieldCheck size={17} aria-hidden="true" /> Account guide</span>
            <span className="lp-independent-line" aria-hidden="true" />
            <div><strong>Account-help reply</strong><span>Independent inputs</span></div>
            <span className="lp-version"><Check size={13} aria-hidden="true" /> v1 · unchanged</span>
          </div>
          <div className="lp-canvas-footer">
            <p className={`lp-example-status lp-status-${status}`} role="status" aria-live="polite" aria-atomic="true">
              {stage === 1 ? <RotateCcw size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
              <strong>{stage === 0 ? 'Original work is current' : stage === 1 ? '5 artifacts need repair' : '5 artifacts repaired'}</strong>
              <span>{stage === 0 ? 'Select “Correct” to change the source' : 'Independent work stays intact'}</span>
            </p>
            <p className="lp-illustration-label">Interactive illustration · Synthetic example</p>
          </div>
        </div>
      </div>
    </section>
  )
}

export function LandingPage() {
  return (
    <div className="landing">
      <a className="skip-link" href="#landing-main">Skip to content</a>
      <header className="lp-header lp-container">
        <a className="lp-brand" href="/" aria-label="UndoGraph home"><GitBranch size={25} aria-hidden="true" />UndoGraph<span className="lp-brand-dot">.</span></a>
        <nav className="lp-navigation" aria-label="Main">
          <a href="#how-it-works">How it works</a>
          <a href="#why-a-graph">Why a graph</a>
          <a href={`${repository}#readme`} target="_blank" rel="noreferrer">Docs <ArrowUpRight size={13} aria-hidden="true" /></a>
        </nav>
        <a className="lp-button lp-button-small lp-button-outline" href="#/overview">Open workspace <ArrowUpRight size={15} aria-hidden="true" /></a>
      </header>

      <main id="landing-main" tabIndex={-1}>
        <section className="lp-hero lp-container" aria-labelledby="lp-title">
          <a className="lp-announcement" href={repository} target="_blank" rel="noreferrer"><span /> Open source. Built on FalkorDB.<ArrowUpRight size={13} aria-hidden="true" /></a>
          <h1 id="lp-title">Agent memory.<br /><span>With a way back.</span></h1>
          <p className="lp-hero-description">When a source changes, your agents’ work should follow.<br className="lp-desktop-break" /> Trace the impact. Repair the right outputs. Keep the rest.</p>
          <div className="lp-hero-actions">
            <a className="lp-button lp-button-mint" href="#/recorded/overview">Explore the demo <ArrowUpRight size={18} aria-hidden="true" /></a>
            <a className="lp-button lp-button-quiet" href={repository} target="_blank" rel="noreferrer"><CodeXml size={18} aria-hidden="true" /> View source</a>
          </div>
          <p className="lp-hero-note">Bring your own sources and questions, or explore the support example. No sign-in.</p>
        </section>

        <CorrectionExample />

        <div className="lp-stack-bar lp-container">
          <p>Real graph memory.<br /><strong>Actual agent workflows.</strong></p>
          <div><GitBranch size={24} aria-hidden="true" /><span><strong>FalkorDB</strong><span>Dependency graph</span></span></div>
          <div><Layers3 size={24} aria-hidden="true" /><span><strong>Cloudflare</strong><span>Workers · AI · Workflows</span></span></div>
          <a href={`${repository}/blob/main/docs/GRAPH.md`} target="_blank" rel="noreferrer">Under the hood <ArrowUpRight size={15} aria-hidden="true" /></a>
        </div>

        <section id="how-it-works" className="lp-how lp-container" aria-labelledby="lp-how-title">
          <div className="lp-section-heading">
            <div><p className="lp-eyebrow"><span>01 /</span> FROM CORRECTION TO REPAIR</p><h2 id="lp-how-title">One correction.<br />A complete chain of evidence.</h2></div>
            <p>A 30-day return policy becomes a 14-day policy. The hard part isn’t saving the new fact. It’s finding the work that still relies on the old one.</p>
          </div>
          <div className="lp-case-study">
            <div className="lp-case-intro">
              <span className="lp-kicker">THE CONSEQUENCE, MADE VISIBLE</span>
              <h3>Same customers.<br />Different evidence.</h3>
              <p>Both return cases need a fresh assessment. Only one changes eligibility.</p>
              <span className="lp-case-caption">Synthetic returns example</span>
            </div>
            <div className="lp-case-table-wrap">
              <table className="lp-case-table">
                <caption className="sr-only">Return eligibility before and after the policy correction</caption>
                <thead><tr><th scope="col">Return case</th><th scope="col">30-day policy <span>Original</span></th><th scope="col">14-day policy <span>Repaired</span></th></tr></thead>
                <tbody>
                  <tr><th scope="row">R-021 <span>Delivered 21 days ago</span></th><td><Check size={14} aria-hidden="true" /> Eligible</td><td className="lp-case-changed"><RotateCcw size={14} aria-hidden="true" /> Not eligible</td></tr>
                  <tr><th scope="row">R-007 <span>Delivered 7 days ago</span></th><td><Check size={14} aria-hidden="true" /> Eligible</td><td><Check size={14} aria-hidden="true" /> Eligible</td></tr>
                </tbody>
              </table>
              <p><GitBranch size={15} aria-hidden="true" /> New input versions. New assessments. A traceable reason for each reply.</p>
            </div>
          </div>
          <div className="lp-principles">
            <article><FileText size={21} aria-hidden="true" /><h3>Keep the evidence.</h3><p>Every output links to the exact input versions it used. A correction adds history; the original remains inspectable.</p></article>
            <article><GitBranch size={21} aria-hidden="true" /><h3>Trace the affected work.</h3><p>Follow dependencies across sessions. Mark the affected chain stale so old evidence can’t pass review.</p></article>
            <article><LockKeyhole size={21} aria-hidden="true" /><h3>Publish a complete repair.</h3><p>Rebuild in dependency order. Promote the replacement set together, after checking its inputs are still current.</p></article>
          </div>
        </section>

        <section id="why-a-graph" className="lp-preservation" aria-labelledby="lp-why-title">
          <div className="lp-container lp-preservation-grid">
            <div className="lp-preservation-copy">
              <p className="lp-eyebrow"><span>02 /</span> PRECISION OVER REGENERATION</p>
              <h2 id="lp-why-title">The best repair<br />knows where to stop.</h2>
              <p>The account-help reply uses a different source. A returns-policy correction never reaches it.</p>
              <p>UndoGraph preserves that reply’s original version and content. The graph gives you the evidence to check.</p>
              <a className="lp-text-link" href="#/recorded/overview">Inspect the preserved work <ArrowUpRight size={16} aria-hidden="true" /></a>
            </div>
            <div className="lp-preservation-proof">
              <div className="lp-proof-heading"><ShieldCheck size={18} aria-hidden="true" /><span>PRESERVATION CHECK</span><span>Recorded example</span></div>
              <div className="lp-proof-artifact"><span className="lp-proof-icon"><MessageSquare size={25} aria-hidden="true" /></span><div><span>INDEPENDENT ARTIFACT</span><h3>Account-help reply</h3><p>Account guide → reply</p></div><span className="lp-proof-version">v1</span></div>
              <dl className="lp-proof-checks"><div><dt>Artifact identity</dt><dd><Check size={15} aria-hidden="true" /> Unchanged</dd></div><div><dt>Content hash</dt><dd><Check size={15} aria-hidden="true" /> Matches original</dd></div><div><dt>Extra model calls</dt><dd>0</dd></div></dl>
              <p className="lp-proof-footer"><Check size={15} aria-hidden="true" /> Preserved through the correction and repair.</p>
            </div>
          </div>
          <div className="lp-observation lp-container">
            <div><span className="lp-kicker">ONE OBSERVED SYNTHETIC RUN</span><h3>Less work, by following the graph.</h3><p>A captured local comparison. Results vary with the workflow.</p><a className="lp-text-link" href={`${repository}/blob/main/docs/VERIFICATION.md`} target="_blank" rel="noreferrer">Read the verification record <ArrowUpRight size={14} aria-hidden="true" /></a></div>
            <div className="lp-observation-stat"><span>Corrected full build</span><strong>4 <span>calls</span></strong></div>
            <ArrowRight className="lp-observation-arrow" size={25} aria-hidden="true" />
            <div className="lp-observation-stat lp-observation-repair"><span>Selective repair</span><strong>3 <span>calls</span></strong></div>
          </div>
        </section>

        <section className="lp-faq lp-container" aria-labelledby="lp-faq-title">
          <div><p className="lp-eyebrow"><span>03 /</span> A LITTLE CONTEXT</p><h2 id="lp-faq-title">Before you<br />go exploring.</h2><a className="lp-text-link" href={`${repository}#readme`} target="_blank" rel="noreferrer">Read the docs <ArrowUpRight size={15} aria-hidden="true" /></a></div>
          <div className="lp-questions">
            <details><summary>What can I try right now?<ChevronDown size={19} aria-hidden="true" /></summary><p>Create a live workspace with your own project documents, research notes, product information, or procedures. Add questions and choose the sources each answer should read. Generate answers, edit a source, and verify selective repair. The recorded support walkthrough remains available as a read-only example.</p></details>
            <details><summary>Does a correction overwrite the original?<ChevronDown size={19} aria-hidden="true" /></summary><p>No. Original artifact versions remain in the graph. A correction creates a new source version; repair creates replacements with exact input links. You can inspect the history and export an audit.</p></details>
            <details><summary>Does a repaired reply go to a customer?<ChevronDown size={19} aria-hidden="true" /></summary><p>No. This is a fictional support workspace. Replies stay inside the demo for internal review. Stale evidence blocks review, and previously released work is flagged for attention.</p></details>
            <details><summary>Is this a memory API I can integrate today?<ChevronDown size={19} aria-hidden="true" /></summary><p>UndoGraph is an open-source demonstration of graph-backed agent memory and selective repair. Explore the working support workflow and its source code; it isn’t a hosted general-purpose memory service.</p></details>
          </div>
        </section>

        <section className="lp-bottom-cta lp-container" aria-labelledby="lp-cta-title">
          <div className="lp-cta-mark" aria-hidden="true"><GitBranch size={32} /></div>
          <p className="lp-eyebrow">CHANGE THE CONTEXT. KEEP THE LINEAGE.</p>
          <h2 id="lp-cta-title">Give your agents<br /><span>a way back.</span></h2>
          <p>One source correction. Every consequence, accounted for.</p>
          <a className="lp-button lp-button-mint" href="#/recorded/overview">Open the recorded demo <ArrowUpRight size={18} aria-hidden="true" /></a>
          <a className="lp-cta-source" href={repository} target="_blank" rel="noreferrer"><CodeXml size={16} aria-hidden="true" /> Build on the source <ArrowRight size={14} aria-hidden="true" /></a>
          <a className="lp-back-to-top" href="#lp-title" aria-label="Back to top"><ArrowDown size={17} aria-hidden="true" /></a>
        </section>
      </main>

      <footer className="lp-footer lp-container">
        <div><a className="lp-brand" href="/" aria-label="UndoGraph home"><GitBranch size={22} aria-hidden="true" />UndoGraph<span className="lp-brand-dot">.</span></a><p>Memory with a traceable way forward.</p></div>
        <p>Built by <a href="https://github.com/Tejas-Sands" target="_blank" rel="noreferrer">Tejas-Sands</a></p>
        <a href={repository} target="_blank" rel="noreferrer">Source on GitHub <ArrowUpRight size={14} aria-hidden="true" /></a>
      </footer>
    </div>
  )
}

import { useState } from 'react'
import {
  ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, FileText,
  GitBranch, CodeXml, Layers3, MessageSquare, RotateCcw, ShieldCheck,
} from 'lucide-react'
import './landing.css'

const repository = 'https://github.com/Tejas-Sands/undograph'
const stages = ['Original', 'Correct', 'Repair'] as const

function CorrectionExample() {
  const [stage, setStage] = useState(0)
  const corrected = stage > 0
  const repaired = stage === 2
  const status = stage === 1 ? 'stale' : repaired ? 'repaired' : 'current'

  return (
    <section className="lp-example" aria-label="Interactive correction example">
      <div className="lp-example-heading">
        <div>
          <p className="lp-kicker">FOLLOW THE DEPENDENCIES</p>
          <h2>A small correction. A visible ripple.</h2>
        </div>
        <GitBranch size={21} aria-hidden="true" />
      </div>
      <div className="lp-stage-picker" role="group" aria-label="Illustration stages">
        {stages.map((label, index) => (
          <button key={label} aria-pressed={stage === index} onClick={() => setStage(index)}>
            <span>{index + 1}.</span> {label}
          </button>
        ))}
      </div>
      <div className={`lp-flow lp-flow-${status}`}>
        <svg className="lp-flow-lines" viewBox="0 0 480 288" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <marker id="lp-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0 0L6 3L0 6Z" fill="currentColor" />
            </marker>
          </defs>
          <path d="M240 60V82 M240 136V147Q240 152 235 152H121Q116 152 116 157V158 M240 152H359Q364 152 364 157V158 M116 212V234 M364 212V234" />
        </svg>
        <div className={`lp-flow-node lp-source ${corrected ? 'lp-source-corrected' : ''}`}>
          <FileText size={18} aria-hidden="true" />
          <div><span>SOURCE · {corrected ? 'v2' : 'v1'}</span><strong>Returns policy</strong></div>
          <div className="lp-source-value">
            {corrected && <s aria-label="Previously 30 days">30</s>}
            <strong>{corrected ? '14' : '30'} days</strong>
          </div>
        </div>
        <div className={`lp-flow-node lp-facts lp-node-${status}`}>
          <Layers3 size={16} aria-hidden="true" />
          <div><span>POLICY FACTS · {repaired ? 'v2' : 'v1'}</span><strong>{repaired ? '14' : '30'}-day window</strong></div>
          <span className="lp-node-state">{stage === 1 ? 'Stale' : 'Current'}</span>
        </div>
        {['R-021', 'R-007'].map((id, index) => (
          <div key={id} className={`lp-flow-node lp-assessment lp-node-${status}`}>
            <span>ASSESSMENT · {repaired ? 'v2' : 'v1'}</span>
            <strong>{id} <span>{index === 0 ? '21' : '7'}-day case</span></strong>
          </div>
        ))}
        {['R-021', 'R-007'].map((id, index) => (
          <div key={id} className={`lp-flow-node lp-reply lp-node-${status}`}>
            <span>{id} REPLY · {repaired ? 'v2' : 'v1'}</span>
            <strong>{stage === 1 ? 'Needs repair' : repaired && index === 0 ? 'Not eligible' : 'Eligible'}</strong>
          </div>
        ))}
      </div>
      <div className="lp-independent">
        <span className="lp-independent-icon"><ShieldCheck size={19} aria-hidden="true" /></span>
        <div><strong>Account-help reply</strong><span>Independent inputs. Preserved.</span></div>
        <span className="lp-version">v1 · unchanged</span>
      </div>
      <p className={`lp-example-status lp-status-${status}`} role="status" aria-live="polite" aria-atomic="true">
        {stage === 1 ? <RotateCcw size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
        <strong>{stage === 0 ? 'Original work is current' : stage === 1 ? '5 artifacts need repair' : '5 artifacts repaired'}</strong>
        <span>{stage === 0 ? 'Try correcting the source' : 'Independent work stays intact'}</span>
      </p>
      <p className="lp-illustration-label">Interactive illustration · Synthetic example</p>
    </section>
  )
}

export function LandingPage() {
  return (
    <div className="landing">
      <a className="skip-link" href="#landing-main">Skip to content</a>
      <header className="lp-header lp-container">
        <a className="lp-brand" href="/" aria-label="UndoGraph home">
          <GitBranch size={27} aria-hidden="true" />UndoGraph
        </a>
        <nav className="lp-navigation" aria-label="Main">
          <a href="#how-it-works">How it works</a>
          <a href="#why-a-graph">Why a graph</a>
        </nav>
        <div className="lp-header-actions">
          <a className="lp-github" href={repository} target="_blank" rel="noreferrer" aria-label="UndoGraph on GitHub">
            <CodeXml size={20} aria-hidden="true" />
          </a>
          <a className="lp-button lp-button-small lp-button-ink" href="#/overview">
            Open workspace <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>
      </header>

      <main id="landing-main" tabIndex={-1}>
        <section className="lp-hero lp-container" aria-labelledby="lp-title">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow"><span /> GRAPH-POWERED AGENT MEMORY</p>
            <h1 id="lp-title"><span>Context changes.</span><span>Keep the right work.</span></h1>
            <p className="lp-hero-description">Your agents share more than a conversation. UndoGraph traces what they used, finds what a correction affects, and repairs the work that depends on it.</p>
            <div className="lp-hero-actions">
              <a className="lp-button lp-button-blue" href="#/recorded/overview">Explore the demo <ArrowUpRight size={19} aria-hidden="true" /></a>
              <a className="lp-text-link" href="#how-it-works">See how it works <ArrowDown size={16} aria-hidden="true" /></a>
            </div>
            <p className="lp-hero-note"><Check size={15} aria-hidden="true" /> Synthetic support cases. Read-only demo. No sign-in.</p>
            <div className="lp-hero-footnote"><span className="lp-footnote-line" /><p>One corrected source.<br /><strong>Every consequence, accounted for.</strong></p></div>
          </div>
          <CorrectionExample />
        </section>

        <div className="lp-stack-bar">
          <div className="lp-container lp-stack-inner">
            <span className="lp-kicker">BUILT ON CONNECTED DATA</span>
            <p><GitBranch size={19} aria-hidden="true" /><strong>FalkorDB</strong><span>Graph memory</span></p>
            <span className="lp-stack-divider" />
            <p><Layers3 size={19} aria-hidden="true" /><strong>Cloudflare</strong><span>Workers · AI · Workflows</span></p>
            <a href={repository} target="_blank" rel="noreferrer">Built in the open <ArrowUpRight size={15} aria-hidden="true" /></a>
          </div>
        </div>

        <section id="how-it-works" className="lp-how lp-container" aria-labelledby="lp-how-title">
          <div className="lp-section-heading">
            <div><p className="lp-eyebrow">FROM CORRECTION TO REPAIR</p><h2 id="lp-how-title">One correction. A complete<br className="lp-desktop-break" /> chain of evidence.</h2></div>
            <p>A return window changes from 30 days to 14. Here’s how that single fact moves through the workspace.</p>
          </div>
          <div className="lp-steps">
            <article>
              <div className="lp-step-number"><span>01 /</span><FileText size={23} aria-hidden="true" /></div>
              <h3>Keep the original evidence.</h3>
              <p>Each agent output records the exact source and input versions it used. The original work stays inspectable.</p>
              <span className="lp-step-detail">source v1 → facts → assessment → reply</span>
            </article>
            <article>
              <div className="lp-step-number"><span>02 /</span><GitBranch size={23} aria-hidden="true" /></div>
              <h3>Follow the ripple.</h3>
              <p>Correct the source with a reason. The graph finds dependent work across sessions and marks affected drafts stale.</p>
              <span className="lp-step-detail">30 days → 14 days · 5 affected artifacts</span>
            </article>
            <article>
              <div className="lp-step-number"><span>03 /</span><RotateCcw size={23} aria-hidden="true" /></div>
              <h3>Repair what depends on it.</h3>
              <p>Rebuild the affected chain in dependency order. Publish the complete replacement set and preserve independent work.</p>
              <span className="lp-step-detail">new evidence · same independent reply</span>
            </article>
          </div>
        </section>

        <section id="why-a-graph" className="lp-why" aria-labelledby="lp-why-title">
          <div className="lp-container lp-why-grid">
            <div className="lp-why-copy">
              <p className="lp-eyebrow">THE GRAPH IS THE MEMORY</p>
              <h2 id="lp-why-title">Know what changed.<br /><span>Prove what didn’t.</span></h2>
              <p>A reply is connected to its assessment, its policy facts, and the source behind them. Those relationships make a correction traceable.</p>
              <p>The password-reset reply uses a different source. It keeps its original version and content, while return-related work gets repaired.</p>
              <a className="lp-text-link" href="#/recorded/overview">Inspect the dependency graph <ArrowUpRight size={17} aria-hidden="true" /></a>
            </div>
            <div className="lp-report">
              <div className="lp-report-heading"><span><Check size={16} aria-hidden="true" /> REPAIR COMPLETE</span><span>Illustrative report</span></div>
              <div className="lp-report-title"><h3>One source. A precise repair.</h3><p>Northstar Goods / Returns policy</p></div>
              <div className="lp-report-row"><span className="lp-report-symbol"><FileText size={18} aria-hidden="true" /></span><div><strong>Returns policy</strong><span>Corrected source</span></div><span className="lp-report-change">v1 <ArrowRight size={13} aria-hidden="true" /> v2</span></div>
              <div className="lp-report-row"><span className="lp-report-symbol"><RotateCcw size={18} aria-hidden="true" /></span><div><strong>Return-related work</strong><span>Facts, assessments and replies</span></div><span className="lp-report-change">5 repaired</span></div>
              <div className="lp-report-row lp-report-preserved"><span className="lp-report-symbol"><MessageSquare size={18} aria-hidden="true" /></span><div><strong>Account-help reply</strong><span>Same version. Same content.</span></div><span className="lp-report-change"><Check size={13} aria-hidden="true" /> Preserved</span></div>
              <div className="lp-report-footer"><ShieldCheck size={17} aria-hidden="true" /><p>Preservation checked against the original<br />artifact ID and content hash.</p></div>
            </div>
          </div>
        </section>

        <section className="lp-faq lp-container" aria-labelledby="lp-faq-title">
          <div><p className="lp-eyebrow">BEFORE YOU EXPLORE</p><h2 id="lp-faq-title">A little context.</h2><p>What you’ll find in the demo.</p></div>
          <div className="lp-questions">
            <details><summary>Can I try it without setting anything up?<ChevronDown size={18} aria-hidden="true" /></summary><p>Yes. The recorded walkthrough lets you inspect original, corrected and repaired synthetic work without signing in. It is permanently labeled read-only. The live workspace runs actual agents when its services are configured.</p></details>
            <details><summary>Does a correction rewrite the old work?<ChevronDown size={18} aria-hidden="true" /></summary><p>Original artifact versions remain in the graph. A correction creates a new source version; repair creates replacements with exact input links. You can inspect the history and export an audit.</p></details>
            <details><summary>Does repairing a reply send it to a customer?<ChevronDown size={18} aria-hidden="true" /></summary><p>No. This is a fictional support workspace. Replies stay inside the demo for internal review. Stale evidence blocks review, and previously released work is flagged for attention.</p></details>
          </div>
        </section>

        <section className="lp-bottom-cta lp-container" aria-labelledby="lp-cta-title">
          <div><p className="lp-eyebrow">CHANGE THE CONTEXT. KEEP THE LINEAGE.</p><h2 id="lp-cta-title">Give your agents<br />a way back.</h2><p>Follow a correction from source to reply.</p></div>
          <div className="lp-bottom-actions"><a className="lp-button lp-button-paper" href="#/recorded/overview">Open the recorded demo <ArrowUpRight size={19} aria-hidden="true" /></a><a className="lp-text-link" href={repository} target="_blank" rel="noreferrer"><CodeXml size={17} aria-hidden="true" /> Explore the source <ArrowUpRight size={15} aria-hidden="true" /></a></div>
          <GitBranch className="lp-cta-branch" size={230} strokeWidth={0.7} aria-hidden="true" />
        </section>
      </main>
      <footer className="lp-footer lp-container">
        <a className="lp-brand" href="/" aria-label="UndoGraph home"><GitBranch size={22} aria-hidden="true" />UndoGraph</a>
        <p>A synthetic support-agent demo by <a href="https://github.com/Tejas-Sands" target="_blank" rel="noreferrer">Tejas-Sands</a>.</p>
        <a href={`${repository}#readme`} target="_blank" rel="noreferrer">Documentation <ArrowUpRight size={14} aria-hidden="true" /></a>
      </footer>
    </div>
  )
}

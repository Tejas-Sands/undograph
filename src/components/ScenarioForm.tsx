import { useEffect, useRef, useState } from 'react'
import { generalWorkspaceSchema, type GeneralWorkspace } from '../../shared/contracts'
import { projectExample, researchExample } from '../../shared/knowledge'

const blankWorkspace = (): GeneralWorkspace => ({ name: '', sources: [{ id: 's1', title: '', text: '' }], questions: [{ id: 'q1', question: '', sourceIds: ['s1'] }] })

export function ScenarioForm({ busy, ready, replacing = false, onCreate, onDemo }: {
  busy: boolean; ready: boolean; replacing?: boolean;
  onCreate: (scenario: GeneralWorkspace) => Promise<void>; onDemo: () => Promise<void>;
}) {
  const [value, setValue] = useState<GeneralWorkspace>(blankWorkspace)
  const [issues, setIssues] = useState<string[]>([])
  const [confirmed, setConfirmed] = useState(false)
  const alert = useRef<HTMLDivElement>(null)
  useEffect(() => { if (issues.length) alert.current?.focus() }, [issues])
  function example(next: GeneralWorkspace) { setValue(structuredClone(next)); setIssues([]) }
  return <section className="panel scenario-panel">
    <div className="section-heading"><div><p className="eyebrow">YOUR SOURCES · YOUR QUESTIONS</p><h2>Create your own workspace</h2><p>Try project requirements, research notes, product information, or procedures.</p></div></div>
    <div className="scenario-examples" role="group" aria-label="Editable starting examples">
      <button type="button" className="button button-secondary" onClick={() => example(projectExample)}>Project notes</button>
      <button type="button" className="button button-secondary" onClick={() => example(researchExample)}>Research notes</button>
      <button type="button" className="button button-secondary" onClick={() => example(blankWorkspace())}>Start blank</button>
    </div>
    <form onSubmit={async event => {
      event.preventDefault()
      const missing = value.questions.findIndex(question => !question.sourceIds.length)
      if (missing >= 0) { setIssues([`Select at least one source for Question ${missing+1}.`]); return }
      const parsed = generalWorkspaceSchema.safeParse(value)
      if (!parsed.success) { setIssues(parsed.error.issues.map(issue => issue.message)); return }
      setIssues([])
      await onCreate(parsed.data)
    }}>
      <label htmlFor="workspace-name">Workspace name</label>
      <input id="workspace-name" placeholder="e.g. My project" required maxLength={80} value={value.name} onChange={event => setValue({ ...value, name: event.target.value })} />
      <div className="scenario-section"><h3>Sources</h3><p>Paste up to three text sources. You can edit each source after generating answers.</p></div>
      <div className="scenario-sources">{value.sources.map((source, index) => <fieldset className="scenario-fieldset" key={source.id}>
        <legend>Source {index+1}</legend>
        <label htmlFor={`source-${index}-title`}>Source {index+1} title</label>
        <input id={`source-${index}-title`} required maxLength={160} value={source.title} onChange={event => setValue({ ...value, sources: value.sources.map((item,i) => i===index ? { ...item, title: event.target.value } : item) })} />
        <label htmlFor={`source-${index}-text`}>Source {index+1} text</label>
        <textarea id={`source-${index}-text`} required maxLength={2000} rows={5} value={source.text} onChange={event => setValue({ ...value, sources: value.sources.map((item,i) => i===index ? { ...item, text: event.target.value } : item) })} />
        <small>{source.text.length}/2,000 characters</small>
        {value.sources.length > 1 && <button type="button" className="text-button" onClick={() => setValue({ ...value, sources: value.sources.filter(item => item.id!==source.id), questions: value.questions.map(question => ({ ...question, sourceIds: question.sourceIds.filter(id => id!==source.id) })) })}>Remove source {index+1}</button>}
      </fieldset>)}</div>
      {value.sources.length<3 && <button type="button" className="button button-secondary" onClick={() => setValue({ ...value, sources: [...value.sources, { id: crypto.randomUUID(), title: '', text: '' }] })}>Add source</button>}
      <div className="scenario-section"><h3>Questions</h3><p>Choose the sources each answer should read. Every supplied source becomes a recorded dependency.</p></div>
      {value.questions.map((question,index) => <fieldset className="scenario-fieldset" key={question.id}>
        <legend>Question {index+1}</legend>
        <label htmlFor={`question-${index}`}>Question {index+1}</label>
        <textarea id={`question-${index}`} required maxLength={500} rows={2} value={question.question} onChange={event => setValue({ ...value, questions: value.questions.map((item,i) => i===index ? { ...item, question: event.target.value } : item) })} />
        <fieldset className="scenario-source-options"><legend>Question {index+1} sources</legend>{value.sources.map((source,sourceIndex) => <label className="scenario-check" key={source.id}>
          <input type="checkbox" checked={question.sourceIds.includes(source.id)} onChange={event => setValue({ ...value, questions: value.questions.map((item,i) => i===index ? { ...item, sourceIds: event.target.checked ? [...item.sourceIds, source.id] : item.sourceIds.filter(id => id!==source.id) } : item) })} />
          {source.title || `Source ${sourceIndex+1}`}
        </label>)}</fieldset>
        {value.questions.length>1 && <button type="button" className="text-button" onClick={() => setValue({ ...value, questions: value.questions.filter(item => item.id!==question.id) })}>Remove question {index+1}</button>}
      </fieldset>)}
      {value.questions.length<3 && <button type="button" className="button button-secondary" onClick={() => setValue({ ...value, questions: [...value.questions, { id: crypto.randomUUID(), question: '', sourceIds: value.sources.map(source => source.id) }] })}>Add question</button>}
      {replacing && <label className="scenario-check scenario-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Start a new workspace and close this one. Export the current audit first if needed.</label>}
      {issues.length>0 && <div className="inline-error" role="alert" ref={alert} tabIndex={-1}>{issues.map((issue,i) => <p key={i}>{issue}</p>)}</div>}
      <div className="scenario-actions">
        <button className="button button-primary" disabled={busy || !ready || (replacing && !confirmed)}>{busy ? 'Creating…' : 'Create live workspace'}</button>
        <button type="button" className="button button-secondary" disabled={busy || !ready || (replacing && !confirmed)} onClick={() => void onDemo()}>Load support example</button>
      </div>
      <p className="muted">Create live workspace uses your details above. Load support example is optional and opens fictional customer-support data. Next, build answers and correct a source to test selective repair.</p>
    </form>
  </section>
}

import { AlertCircle, CheckCircle2, PanelRightClose, Sparkles } from 'lucide-react'
import { PanelHeader } from '../components/shared/PanelHeader'
import { cardLabels, type PipelineNode } from '../domain/pipeline'
import { cardRoleContracts } from '../domain/agent-runner'
import type { ValidationIssue } from '../validation'

interface CardInspectorViewProps {
  selected?: PipelineNode
  issues: ValidationIssue[]
  errorCount: number
  onAgentRework(): void
  onClose(): void
  onSelectNode(nodeId: string): void
  onUpdate(patch: Partial<PipelineNode['data']>): void
}

export function CardInspectorView({ errorCount, issues, onAgentRework, onClose, onSelectNode, onUpdate, selected }: CardInspectorViewProps) {
  const role = selected ? cardRoleContracts[selected.data.kind] : undefined
  return <>
    <PanelHeader action={<button aria-label="Close inspector" className="panel-toggle" onClick={onClose} title="Close inspector" type="button"><PanelRightClose size={16} /></button>} eyebrow="INSPECT" title={selected ? cardLabels[selected.data.kind] : 'Pipeline'} />
    {selected ? <div className="inspector-form">
      <section className="card-agent-workspace"><div><Sparkles size={15} /><span><strong>Agent workspace</strong><small>Analyze and rework this card from DataHub context.</small></span></div><button onClick={onAgentRework} type="button">Ask agent to rework</button></section>
      {role && <section className="role-contract"><div><small>AGENT ROLE</small><strong>{role.role}</strong><p>{role.mission}</p></div><dl><div><dt>Input</dt><dd>{role.input}</dd></div><div><dt>Output</dt><dd>{role.output}</dd></div><div><dt>Tools</dt><dd>{role.allowedTools.length ? role.allowedTools.join(' · ') : 'No external tools'}</dd></div></dl></section>}
      <label>Card name<input value={selected.data.label} onChange={(event) => onUpdate({ label: event.target.value })} /></label>
      <label>Description<textarea rows={3} value={selected.data.description} onChange={(event) => onUpdate({ description: event.target.value })} /></label>
      <label>Owner<input value={selected.data.owner} onChange={(event) => onUpdate({ owner: event.target.value })} /></label>
      {selected.data.rule !== undefined && <label>Rule<textarea className="code-input" rows={3} value={selected.data.rule} onChange={(event) => onUpdate({ rule: event.target.value })} /></label>}
      {selected.data.datahubUrn !== undefined && <label>DataHub URN<textarea className="code-input" rows={3} value={selected.data.datahubUrn} onChange={(event) => onUpdate({ datahubUrn: event.target.value })} /></label>}
      {selected.data.schema.length > 0 && <section className="schema-list"><h3>Schema · {selected.data.schema.length} fields</h3>{selected.data.schema.map((field) => <div key={field.name}><code>{field.name}</code><span>{field.type}</span>{field.tags?.map((tag) => <em key={tag}>{tag}</em>)}</div>)}</section>}
    </div> : <p className="empty-copy">Select a card to inspect its metadata.</p>}

    <section className="validation-list">
      <div className="validation-heading"><h3>Atomic validation</h3><span className={errorCount ? 'count-error' : 'count-good'}>{errorCount ? `${errorCount} blocking` : 'Ready'}</span></div>
      {issues.map((issue) => <button key={issue.id} onClick={() => issue.nodeId && onSelectNode(issue.nodeId)} type="button"><span className={`issue-icon ${issue.severity}`}>{issue.severity === 'error' ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}</span><div><strong>{issue.title}</strong><small>{issue.detail}</small><code className="validation-atom-id">{issue.atomId}</code></div></button>)}
      {issues.length === 0 && <div className="all-clear"><CheckCircle2 size={17} /><div><strong>All atomic checks passed</strong><small>Direction, topology and governance contracts are valid.</small></div></div>}
    </section>
  </>
}

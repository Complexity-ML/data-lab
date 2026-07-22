import { Check, DatabaseZap, GitCompareArrows, PanelRightClose, ShieldCheck, Sparkles, X } from 'lucide-react'
import type { AgentProposal } from '../domain/pipeline'
import { ActionButton } from './shared/ActionButton'

interface ReviewPanelProps {
  proposal: AgentProposal
  onApply(): void
  onDiscard(): void
  onClose(): void
}

export function ReviewPanel({ proposal, onApply, onClose, onDiscard }: ReviewPanelProps) {
  return <section className="review-panel">
    <div className="review-heading">
      <span><Sparkles size={16} /></span>
      <div><small>AGENT PROPOSAL</small><h2>{proposal.title}</h2></div>
      <button aria-label="Close inspector" className="panel-toggle review-close" onClick={onClose} title="Close inspector" type="button"><PanelRightClose size={16} /></button>
    </div>

    <p className="review-summary">{proposal.summary}</p>
    <div className="review-rationale"><ShieldCheck size={17} /><p>{proposal.rationale}</p></div>

    {proposal.runTrace?.length ? <section className="review-section run-trace">
      <h3><Sparkles size={15} /> Agent card run</h3>
      <ol>{proposal.runTrace.map((step, index) => <li className={`trace-${step.state}`} key={`${step.nodeId}-${index}`}><span>{index + 1}</span><div><strong>{step.label}</strong><small>{step.role} · {step.summary}</small></div></li>)}</ol>
    </section> : null}

    <section className="review-section">
      <h3><DatabaseZap size={15} /> DataHub context read</h3>
      <ol>{proposal.datahubReads.map((item) => <li key={item}><code>{item}</code></li>)}</ol>
    </section>

    <section className="review-section">
      <h3><GitCompareArrows size={15} /> Proposed diff</h3>
      {proposal.addedNodes.map((node) => <div className="diff-row diff-add" key={node.id}><span>+</span><div><strong>{node.data.label}</strong><small>{node.data.rule}</small></div></div>)}
      {proposal.updatedNodes.map((update) => <div className="diff-row diff-edit" key={update.nodeId}><span>~</span><div><strong>Edit {update.nodeId}</strong><small>{update.reason}</small></div></div>)}
      {proposal.removedEdgeIds.map((edgeId) => <div className="diff-row diff-remove" key={edgeId}><span>−</span><div><strong>Replace connection</strong><small>{edgeId}</small></div></div>)}
      {proposal.addedEdges.map((edge) => <div className="diff-row diff-add" key={edge.id}><span>+</span><div><strong>Connect cards</strong><small>{edge.source} → {edge.target}</small></div></div>)}
    </section>

    <section className="writeback-note">
      <h3>After approval</h3>
      <p>{proposal.writeback}</p>
    </section>

    <footer className="review-actions">
      <ActionButton icon={<X size={15} />} onClick={onDiscard} variant="secondary">Reject</ActionButton>
      <ActionButton icon={<Check size={15} />} onClick={onApply} variant="primary">Approve change</ActionButton>
    </footer>
  </section>
}

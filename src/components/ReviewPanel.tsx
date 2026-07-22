import { Check, DatabaseZap, GitCompareArrows, ShieldCheck, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AgentProposal } from '../domain/pipeline'
import { ActionButton } from './shared/ActionButton'

interface ReviewPanelProps {
  proposal: AgentProposal
  relatedAssets: string[]
  revisionId?: string
  writebackAvailable: boolean
  onApply(writebackRequested: boolean): void
  onDiscard(): void
  onClose(): void
}

export function ReviewPanel({ proposal, relatedAssets, revisionId, writebackAvailable, onApply, onClose, onDiscard }: ReviewPanelProps) {
  const [writebackRequested, setWritebackRequested] = useState(false)
  useEffect(() => setWritebackRequested(false), [proposal.title, revisionId])

  return <section className="review-panel">
    <div className="review-heading">
      <span><Sparkles size={16} /></span>
      <div><small>AGENT PROPOSAL</small><h2 id="proposal-review-title">{proposal.title}</h2></div>
      <button aria-label="Close proposal review" className="panel-toggle review-close" onClick={onClose} title="Close proposal review" type="button"><X size={16} /></button>
    </div>

    <p className="review-summary">{proposal.summary}</p>
    {(proposal.model || proposal.confidence !== undefined) && <div className="review-agent-meta"><span>{proposal.model ?? 'Connected model'}</span>{proposal.confidence !== undefined && <span>{Math.round(proposal.confidence * 100)}% confidence</span>}<span>{proposal.requiresHumanReview ? 'Human Review path' : 'Agent Decision path'}</span></div>}
    <div className="review-rationale"><ShieldCheck size={17} /><p>{proposal.rationale}</p></div>

    <div className="review-body-grid">
      <div className="review-body-column">
        {proposal.runTrace?.length ? <section className="review-section run-trace">
          <h3><Sparkles size={15} /> Agent card run</h3>
          <ol>{proposal.runTrace.map((step, index) => <li className={`trace-${step.state}`} key={`${step.nodeId}-${index}`}><span>{index + 1}</span><div><strong>{step.label}</strong><small>{step.role} · {step.summary}</small></div></li>)}</ol>
        </section> : null}

        <section className="review-section">
          <h3><DatabaseZap size={15} /> DataHub context read</h3>
          <ol>{proposal.datahubReads.map((item) => <li key={item}><code>{item}</code></li>)}</ol>
        </section>
      </div>

      <div className="review-body-column">
        <section className="review-section">
          <h3><GitCompareArrows size={15} /> Proposed graph diff</h3>
          {proposal.addedNodes.map((node) => <div className="diff-row diff-add" key={node.id}><span>+</span><div><strong>{node.data.label}</strong><small>{node.data.rule}</small></div></div>)}
          {proposal.updatedNodes.map((update) => <div className="diff-row diff-edit" key={update.nodeId}><span>~</span><div><strong>Edit {update.nodeId}</strong><small>{update.reason}</small></div></div>)}
          {proposal.removedEdgeIds.map((edgeId) => <div className="diff-row diff-remove" key={edgeId}><span>−</span><div><strong>Replace connection</strong><small>{edgeId}</small></div></div>)}
          {proposal.addedEdges.map((edge) => <div className="diff-row diff-add" key={edge.id}><span>+</span><div><strong>Connect cards</strong><small>{edge.source} → {edge.target}</small></div></div>)}
        </section>

        <section className="writeback-note">
          <h3>Local commit</h3>
          <p>{proposal.writeback}</p>
        </section>

        <section className="review-section datahub-writeback-review">
          <h3><DatabaseZap size={15} /> Optional DataHub write-back</h3>
          {writebackAvailable && revisionId ? <>
            <label className="writeback-approval-toggle">
              <input checked={writebackRequested} onChange={(event) => setWritebackRequested(event.target.checked)} type="checkbox" />
              <span><strong>Also publish this approved Decision to DataHub</strong><small>This is an external mutation and is never selected automatically.</small></span>
            </label>
            {writebackRequested && <div className="writeback-mutation-preview" role="region" aria-label="DataHub mutation preview">
              <strong>Exact mutation preview</strong>
              <dl>
                <div><dt>Tool</dt><dd><code>save_document</code></dd></div>
                <div><dt>Type</dt><dd><code>Decision</code></dd></div>
                <div><dt>Title</dt><dd>DATA LAB · {proposal.title}</dd></div>
                <div><dt>Revision</dt><dd><code>{revisionId}</code></dd></div>
                <div><dt>Author</dt><dd>DATA LAB operator</dd></div>
                <div><dt>Rationale</dt><dd>{proposal.rationale}</dd></div>
                <div><dt>Related assets</dt><dd>{relatedAssets.length ? relatedAssets.join(', ') : 'None bound'}</dd></div>
              </dl>
            </div>}
          </> : <p className="writeback-unavailable">Disabled by default. Connect DataHub and explicitly enable governed write-back in Settings to make this option available.</p>}
        </section>
      </div>
    </div>

    <footer className="review-actions">
      <ActionButton icon={<X size={15} />} onClick={onDiscard} variant="secondary">Reject</ActionButton>
      <ActionButton icon={<Check size={15} />} onClick={() => onApply(writebackRequested)} variant="primary">Approve change</ActionButton>
    </footer>
  </section>
}

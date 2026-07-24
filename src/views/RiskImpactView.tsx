import { AlertTriangle, ChartNetwork, CheckCircle2, PanelRightClose, ShieldAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PanelHeader } from '../components/shared/PanelHeader'
import type { RiskImpactOverview } from '../domain/risk-impact'
import { riskItemsForDomain } from '../domain/risk-impact'
import { riskDomains, type RiskDomain } from '../domain/risk-assessment'

interface RiskImpactViewProps {
  onClose(): void
  onSelectCard(nodeId: string): void
  overview: RiskImpactOverview
}

const labels: Record<'all' | RiskDomain, string> = {
  all: 'All',
  general: 'General',
  data: 'Data',
  ml: 'ML',
  analytics: 'Analytics',
  privacy: 'Privacy',
  governance: 'Governance',
  security: 'Security',
  reliability: 'Reliability',
}

export function RiskImpactView({ onClose, onSelectCard, overview }: RiskImpactViewProps) {
  const [domain, setDomain] = useState<'all' | RiskDomain>('all')
  const items = useMemo(() => riskItemsForDomain(overview, domain), [domain, overview])
  return <>
    <PanelHeader action={<button aria-label="Close impact and risks" className="panel-toggle" onClick={onClose} title="Close impact and risks" type="button"><PanelRightClose size={16} /></button>} eyebrow="RISK" title="Impact & Risks" />
    <div className="risk-panel-content">
      <section className="risk-overview">
        <div><strong>{overview.actionable}</strong><small>Actionable</small></div>
        <div><strong>{overview.critical}</strong><small>Critical</small></div>
        <div><strong>{overview.high}</strong><small>High</small></div>
        <div><strong>{overview.coverageGaps}</strong><small>Coverage gaps</small></div>
      </section>

      <div aria-label="Risk domain" className="risk-domain-selector" role="tablist">
        {(['all', ...riskDomains] as const).map((value) => <button
          aria-selected={domain === value}
          className={domain === value ? 'is-active' : ''}
          key={value}
          onClick={() => setDomain(value)}
          role="tab"
          type="button"
        >{labels[value]}</button>)}
      </div>

      <div className="risk-panel-heading"><strong>{labels[domain]} analysis</strong><small>{items.length} signal{items.length === 1 ? '' : 's'}</small></div>
      {items.length ? <div className="risk-panel-list">{items.map((item) => <button className={`kind-${item.kind} severity-${item.severity}`} key={item.id} onClick={() => onSelectCard(item.nodeId)} type="button">
        <span>{item.kind === 'impact' ? <ChartNetwork size={15} /> : item.kind === 'coverage-gap' ? <AlertTriangle size={15} /> : <ShieldAlert size={15} />}</span>
        <div>
          <small>{labels[item.domain]} · {item.kind.replace('-', ' ')}</small>
          <strong>{item.title}</strong>
          <p>{item.detail}</p>
          <dl>
            {item.evidence && <div><dt>Evidence</dt><dd>{item.evidence}</dd></div>}
            {item.affectedAssets !== undefined && <div><dt>Assets</dt><dd>{item.affectedAssets}</dd></div>}
            {item.affectedModels !== undefined && <div><dt>Models</dt><dd>{item.affectedModels}</dd></div>}
          </dl>
          <em>{item.action}</em>
        </div>
      </button>)}</div> : <div className="risk-panel-clear"><CheckCircle2 size={18} /><span><strong>No matching risk</strong><small>This domain has no current Risk Assessment or uncovered Impact Analysis.</small></span></div>}
    </div>
  </>
}

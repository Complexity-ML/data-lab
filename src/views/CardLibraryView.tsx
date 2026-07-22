import { BrainCircuit, Database, Dices, GitBranch, Plus, SearchCheck, Send, UserCheck, WandSparkles } from 'lucide-react'
import { PanelHeader } from '../components/shared/PanelHeader'
import { cardLabels, type CardKind } from '../domain/pipeline'

const palette: { kind: CardKind; description: string; icon: typeof Database }[] = [
  { kind: 'source', description: 'Table, API or event stream', icon: Database },
  { kind: 'analysis', description: 'Read schema, quality and lineage', icon: BrainCircuit },
  { kind: 'split', description: 'Route rows into branches', icon: GitBranch },
  { kind: 'decision', description: 'Correction or human escalation', icon: Dices },
  { kind: 'transform', description: 'Clean, map or aggregate', icon: WandSparkles },
  { kind: 'review', description: 'Ask a human before continuing', icon: UserCheck },
  { kind: 'validation', description: 'Schema and policy gate', icon: SearchCheck },
  { kind: 'output', description: 'Table, model or activation', icon: Send },
]

export function CardLibraryView({ onAddCard }: { onAddCard(kind: CardKind): void }) {
  return <aside className="library-panel">
    <PanelHeader action={<Plus size={16} />} eyebrow="BUILD" title="Card library" />
    <p className="panel-intro">Compose a directional data pipeline. Every card remains inspectable and reviewable.</p>
    <div className="palette-list">{palette.map(({ kind, description, icon: Icon }) => <button className={`palette-card palette-${kind}`} key={kind} onClick={() => onAddCard(kind)} type="button"><span><Icon size={16} /></span><div><strong>{cardLabels[kind]}</strong><small>{description}</small></div><Plus size={14} /></button>)}</div>
    <section className="datahub-context">
      <div><Database size={15} /><strong>DataHub context</strong></div>
      <p>Schema, lineage, ownership and PII tags are loaded before the agent proposes a change.</p>
      <ul><li>customers_360</li><li>2 downstream outputs</li><li>1 PII field</li></ul>
    </section>
  </aside>
}

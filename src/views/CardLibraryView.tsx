import { Bot, BrainCircuit, ChartColumn, ChartNetwork, Database, Dices, FileDiff, GitBranch, LayoutDashboard, Network, PanelLeftClose, Plus, Radar, SearchCheck, Send, UserCheck, WandSparkles } from 'lucide-react'
import { PanelHeader } from '../components/shared/PanelHeader'
import { cardLabels, type CardKind } from '../domain/pipeline'

const palette: { kind: CardKind; description: string; icon: typeof Database }[] = [
  { kind: 'control', description: 'Persistent autonomous player policy', icon: Bot },
  { kind: 'source', description: 'Table, API or event stream', icon: Database },
  { kind: 'profile', description: 'Compact reusable data reading', icon: ChartColumn },
  { kind: 'analysis', description: 'Read schema, quality and lineage', icon: BrainCircuit },
  { kind: 'impact', description: 'Trace change impact to models', icon: ChartNetwork },
  { kind: 'patch', description: 'Reversible graph-only compatibility fix', icon: FileDiff },
  { kind: 'monitor', description: 'Restart safely when connected evidence changes', icon: Radar },
  { kind: 'parallel', description: 'Delegate independent graph branches', icon: Network },
  { kind: 'diagram', description: 'Merge incident branch diagrams atomically', icon: LayoutDashboard },
  { kind: 'split', description: 'Route rows into branches', icon: GitBranch },
  { kind: 'decision', description: 'Correction or human escalation', icon: Dices },
  { kind: 'transform', description: 'Clean, map or aggregate', icon: WandSparkles },
  { kind: 'review', description: 'Ask a human before continuing', icon: UserCheck },
  { kind: 'validation', description: 'Schema and policy gate', icon: SearchCheck },
  { kind: 'output', description: 'Table, model or activation', icon: Send },
]

export function CardLibraryView({ onAddCard, onClose }: { onAddCard(kind: CardKind): void; onClose(): void }) {
  return <aside className="library-panel">
    <PanelHeader action={<button aria-label="Close card library" className="panel-toggle" onClick={onClose} title="Close card library" type="button"><PanelLeftClose size={16} /></button>} eyebrow="BUILD" title="Card library" />
    <p className="panel-intro">Compose a directional data pipeline. Every card remains inspectable and reviewable.</p>
    <div className="palette-list">{palette.map(({ kind, description, icon: Icon }) => <button
      className={`palette-card palette-${kind}`}
      draggable
      key={kind}
      onClick={() => onAddCard(kind)}
      onDragEnd={(event) => event.currentTarget.classList.remove('is-dragging')}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'copy'
        event.dataTransfer.setData('application/data-lab-card', kind)
        event.dataTransfer.setData('text/plain', cardLabels[kind])
        event.currentTarget.classList.add('is-dragging')
      }}
      title={`Click to add or drag ${cardLabels[kind]} onto the canvas`}
      type="button"
    ><span><Icon size={16} /></span><div><strong>{cardLabels[kind]}</strong><small>{description}</small></div><Plus size={14} /></button>)}</div>
    <section className="datahub-context">
      <div><Database size={15} /><strong>DataHub context</strong></div>
      <p>Schema, lineage, ownership and PII tags are loaded before the agent proposes a change.</p>
      <ul><li>customers_360</li><li>2 downstream outputs</li><li>1 PII field</li></ul>
    </section>
  </aside>
}

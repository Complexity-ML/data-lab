import { Binoculars, Bot, Braces, BrainCircuit, ChartColumn, ChartNetwork, Cpu, Database, Dices, FileDiff, GitBranch, LayoutDashboard, Network, PanelLeftClose, Plus, Radar, SearchCheck, Send, ShieldAlert, SlidersHorizontal, UserCheck, WandSparkles } from 'lucide-react'
import { useState } from 'react'
import { PanelHeader } from '../components/shared/PanelHeader'
import { PanelScrollArea } from '../components/shared/PanelScrollArea'
import { cardLabels, type CardKind } from '../domain/pipeline'
import { visibleCardKinds, type ProductMode } from '../domain/product-scope'

const palette: { kind: CardKind; description: string; icon: typeof Database }[] = [
  { kind: 'control', description: 'Persistent autonomous player policy', icon: Bot },
  { kind: 'explorer', description: 'Discover and audit the complete catalog', icon: Binoculars },
  { kind: 'worker', description: 'Run bounded reusable work batches', icon: Cpu },
  { kind: 'query', description: 'Audit bounded dataset aggregates or governed writes', icon: Braces },
  { kind: 'source', description: 'Table, API or event stream', icon: Database },
  { kind: 'profile', description: 'Version row, null, uniqueness and distribution evidence', icon: ChartColumn },
  { kind: 'analysis', description: 'Interpret schema, aggregate quality and lineage', icon: BrainCircuit },
  { kind: 'impact', description: 'Trace change impact to models', icon: ChartNetwork },
  { kind: 'risk', description: 'Classify aggregate data, privacy and ML risk', icon: ShieldAlert },
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
  const [mode, setMode] = useState<ProductMode>('incident-response')
  const visible = new Set(visibleCardKinds(mode))
  return <aside className="library-panel">
    <PanelHeader action={<button aria-label="Close card library" className="panel-toggle" onClick={onClose} title="Close card library" type="button"><PanelLeftClose size={16} /></button>} eyebrow="INCIDENT RESPONSE" title="Incident cards" />
    <PanelScrollArea className="library-panel-content" label="Card library content">
      <p className="panel-intro">Investigate one catalog-backed incident, trace its impact and keep every correction reviewable.</p>
      <div className="palette-list">{palette.filter(({ kind }) => visible.has(kind)).map(({ kind, description, icon: Icon }) => <button
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
      <button
        aria-pressed={mode === 'advanced'}
        className="advanced-card-toggle"
        onClick={() => setMode((current) => current === 'advanced' ? 'incident-response' : 'advanced')}
        type="button"
      >
        <SlidersHorizontal size={15} />
        <span><strong>{mode === 'advanced' ? 'Hide advanced pipeline cards' : 'Show advanced pipeline cards'}</strong><small>{mode === 'advanced' ? 'Return to the incident-response surface' : 'Builder, parallel-agent and transformation primitives'}</small></span>
      </button>
      <section className="datahub-context">
        <div><Database size={15} /><strong>Catalog evidence</strong></div>
        <p>DATA LAB consumes normalized schema, lineage, ownership, classifications and bounded profiles through a provider-neutral catalog contract.</p>
        <ul><li>DataHub built in</li><li>Catalog v1 adapters</li><li>no raw rows</li></ul>
      </section>
    </PanelScrollArea>
  </aside>
}

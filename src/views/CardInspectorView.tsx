import { AlertCircle, CheckCircle2, Focus, PanelRightClose, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { PanelHeader } from '../components/shared/PanelHeader'
import { DataHubAssetPicker } from '../components/shared/DataHubAssetPicker'
import type { DataHubAssetSummary } from '../domain/datahub'
import { cardLabels, type PipelineNode } from '../domain/pipeline'
import { cardRoleContracts } from '../domain/agent-runner'
import type { ValidationIssue } from '../validation'

interface CardInspectorViewProps {
  selected?: PipelineNode
  issues: ValidationIssue[]
  errorCount: number
  dataHubConnected: boolean
  workbenchAssets: Record<string, { nodeId: string; label: string }>
  onBindDataHubSource(asset: DataHubAssetSummary): void
  onInspectDataHubAsset(urn: string, force?: boolean): Promise<{ asset: DataHubAssetSummary }>
  onOpenDataHubSettings(): void
  onSearchDataHub(query: string): Promise<DataHubAssetSummary[]>
  onAgentRework(): void
  onClose(): void
  onFocusDiagram(nodeId: string): void
  onSelectNode(nodeId: string): void
  onUpdate(patch: Partial<PipelineNode['data']>): void
}

export function CardInspectorView({ dataHubConnected, errorCount, issues, onAgentRework, onBindDataHubSource, onClose, onFocusDiagram, onInspectDataHubAsset, onOpenDataHubSettings, onSearchDataHub, onSelectNode, onUpdate, selected, workbenchAssets }: CardInspectorViewProps) {
  const [lineageExpanded, setLineageExpanded] = useState(false)
  useEffect(() => setLineageExpanded(false), [selected?.id])
  const role = selected ? cardRoleContracts[selected.data.kind] : undefined
  const lineage = useMemo(() => [...(selected?.data.datahubUpstream ?? []), ...(selected?.data.datahubDownstream ?? [])], [selected?.data.datahubDownstream, selected?.data.datahubUpstream])
  const visibleLineage = lineage.slice(0, lineageExpanded ? 30 : 12)
  return <>
    <PanelHeader action={<button aria-label="Close inspector" className="panel-toggle" onClick={onClose} title="Close inspector" type="button"><PanelRightClose size={16} /></button>} eyebrow="INSPECT" title={selected ? cardLabels[selected.data.kind] : 'Pipeline'} />
    {selected ? <div className="inspector-form">
      <section className="card-agent-workspace"><div><Sparkles size={15} /><span><strong>Agent workspace</strong><small>Analyze and rework this card from DataHub context.</small></span></div><button onClick={onAgentRework} type="button">Ask agent to rework</button></section>
      {selected.data.kind === 'diagram' && <section className="diagram-focus"><div><Focus size={15} /><span><strong>Incident workstream</strong><small>Frame the parallel incident branches merged by this diagram.</small></span></div><button onClick={() => onFocusDiagram(selected.id)} type="button">Focus subgraph</button></section>}
      {role && <section className="role-contract"><div><small>AGENT ROLE</small><strong>{role.role}</strong><p>{role.mission}</p></div><dl><div><dt>Input</dt><dd>{role.input}</dd></div><div><dt>Output</dt><dd>{role.output}</dd></div><div><dt>Tools</dt><dd>{role.allowedTools.length ? role.allowedTools.join(' · ') : 'No external tools'}</dd></div></dl></section>}
      {selected.data.kind === 'source' && <DataHubAssetPicker connected={dataHubConnected} onBind={onBindDataHubSource} onInspect={onInspectDataHubAsset} onOpenSettings={onOpenDataHubSettings} onSearch={onSearchDataHub} />}
      <label>Card name<input value={selected.data.label} onChange={(event) => onUpdate({ label: event.target.value })} /></label>
      <label>Description<textarea rows={3} value={selected.data.description} onChange={(event) => onUpdate({ description: event.target.value })} /></label>
      <label>Owner<input value={selected.data.owner} onChange={(event) => onUpdate({ owner: event.target.value })} /></label>
      <label className="inspector-check"><input checked={Boolean(selected.data.pinned)} onChange={(event) => onUpdate({ pinned: event.target.checked })} type="checkbox" /><span><strong>Pin manual position</strong><small>Auto-layout will route around this card without moving it.</small></span></label>
      {selected.data.rule !== undefined && <label>Rule<textarea className="code-input" rows={3} value={selected.data.rule} onChange={(event) => onUpdate({ rule: event.target.value })} /></label>}
      {selected.data.datahubUrn && <section className="bound-datahub-source"><small>BOUND DATAHUB URN</small><code>{selected.data.datahubUrn}</code><span>{selected.data.datahubPlatform ?? 'unknown platform'} · {selected.data.datahubEnvironment ?? 'unknown environment'}</span></section>}
      {selected.data.kind !== 'source' && selected.data.datahubUrn !== undefined && <label>DataHub URN<textarea className="code-input" rows={3} value={selected.data.datahubUrn} onChange={(event) => onUpdate({ datahubUrn: event.target.value })} /></label>}
      {selected.data.datahubUrn && <section className="datahub-governance-signals"><h3>Governance signals</h3><dl><div><dt>Domain</dt><dd>{selected.data.datahubDomain ?? 'Unavailable'}</dd></div><div><dt>Quality</dt><dd>{selected.data.datahubQuality ?? 'Unavailable'}</dd></div><div><dt>Ownership</dt><dd>{selected.data.owner === 'Unassigned' ? 'Missing · blocks publication' : selected.data.owner}</dd></div></dl><div>{selected.data.datahubTags?.length ? selected.data.datahubTags.map((tag) => <span key={tag}>{tag}</span>) : <small>Tags unavailable</small>}</div></section>}
      {selected.data.datahubUrn && <section className="datahub-lineage-impact"><h3>Lineage impact</h3><div><span>↑ {selected.data.datahubUpstream?.length ?? 0} upstream</span><span>↓ {selected.data.datahubDownstream?.length ?? 0} downstream</span></div>{visibleLineage.map((asset) => {
        const workbench = workbenchAssets[asset.urn]
        const className = `${asset.sensitive ? 'is-sensitive ' : ''}${workbench ? 'is-workbench' : 'is-external'}`.trim()
        return workbench
          ? <button className={className} key={`${asset.urn}-${asset.name}`} onClick={() => onSelectNode(workbench.nodeId)} type="button"><code>{asset.name}</code><small>Workbench card · {workbench.label}</small></button>
          : <p className={className} key={`${asset.urn}-${asset.name}`}><code>{asset.name}</code><small>{asset.sensitive ? 'Sensitive external path' : 'External DataHub asset'}</small></p>
      })}{lineage.length > 12 && <button className="lineage-expand" onClick={() => setLineageExpanded((current) => !current)} type="button">{lineageExpanded ? 'Show first 12' : `Show ${Math.min(lineage.length, 30) - 12} more`}</button>}{lineage.length > 30 && <small className="lineage-bound">Expansion is bounded to 30 assets. Refine the lineage query for a narrower impact radius.</small>}</section>}
      {selected.data.schema.length > 0 && <section className="schema-list"><h3>Schema · {selected.data.schema.length} fields</h3>{selected.data.schema.map((field) => <div key={field.name}><code>{field.name}</code><span>{field.type}</span>{field.tags?.map((tag) => <em key={tag}>{tag}</em>)}</div>)}</section>}
    </div> : <p className="empty-copy">Select a card to inspect its metadata.</p>}

    <section className="validation-list">
      <div className="validation-heading"><h3>Atomic validation</h3><span className={errorCount ? 'count-error' : 'count-good'}>{errorCount ? `${errorCount} blocking` : 'Ready'}</span></div>
      {issues.map((issue) => <button key={issue.id} onClick={() => issue.nodeId && onSelectNode(issue.nodeId)} type="button"><span className={`issue-icon ${issue.severity}`}>{issue.severity === 'error' ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}</span><div><strong>{issue.title}</strong><small>{issue.detail}</small><code className="validation-atom-id">{issue.atomId}</code></div></button>)}
      {issues.length === 0 && <div className="all-clear"><CheckCircle2 size={17} /><div><strong>All atomic checks passed</strong><small>Direction, topology and governance contracts are valid.</small></div></div>}
    </section>
  </>
}

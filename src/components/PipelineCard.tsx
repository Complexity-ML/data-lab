import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import { Binoculars, Bot, BrainCircuit, ChartColumn, ChartNetwork, CheckCircle2, CirclePause, CircleStop, CircleX, Cpu, Database, Dices, FileDiff, GitBranch, LayoutDashboard, LoaderCircle, Network, Radar, SearchCheck, Send, ShieldAlert, Sparkles, UserCheck, WandSparkles } from 'lucide-react'
import { useEffect } from 'react'
import type { PipelineNode } from '../domain/pipeline'
import { parseCatalogExplorerPolicy } from '../domain/catalog-explorer-policy'
import { parseRiskAssessmentRule } from '../domain/risk-assessment'
import { parseWorkerPolicy } from '../domain/worker-policy'

const icons = {
  control: Bot,
  explorer: Binoculars,
  worker: Cpu,
  source: Database,
  profile: ChartColumn,
  analysis: BrainCircuit,
  impact: ChartNetwork,
  risk: ShieldAlert,
  patch: FileDiff,
  monitor: Radar,
  parallel: Network,
  diagram: LayoutDashboard,
  split: GitBranch,
  decision: Dices,
  transform: WandSparkles,
  review: UserCheck,
  validation: SearchCheck,
  output: Send,
}

export function PipelineCard({ data, id, selected }: NodeProps<PipelineNode>) {
  const updateNodeInternals = useUpdateNodeInternals()
  const Icon = icons[data.kind]
  const isSplit = data.kind === 'split'
  const isOutput = data.kind === 'output'
  const isSource = data.kind === 'source'
  const workerPolicy = data.kind === 'worker' ? parseWorkerPolicy(data.rule) : undefined
  const isSystem = data.kind === 'control' || data.kind === 'explorer' || workerPolicy?.role === 'exploration'
  const risk = data.kind === 'risk' ? parseRiskAssessmentRule(data.rule) : undefined
  const exploration = data.kind === 'explorer' ? data.exploration : undefined
  const explorerPolicy = data.kind === 'explorer' ? parseCatalogExplorerPolicy(data.rule) : undefined

  useEffect(() => {
    updateNodeInternals(id)
  }, [data.kind, id, updateNodeInternals])

  return <article className={`pipeline-card card-${data.kind} status-${data.status} run-${data.runState ?? 'idle'} ${selected ? 'is-selected' : ''}`}>
    {!isSource && !isSystem && <Handle className="pipeline-handle" position={Position.Left} type="target" />}
    <header>
      <span className="card-icon"><Icon size={16} /></span>
      <span className="card-kind">{data.kind}</span>
      {data.agentAdded && <span className="agent-badge"><Sparkles size={11} /> Agent</span>}
      {data.kind === 'patch' && <span className="patch-scope-badge">Graph only</span>}
      {data.kind === 'monitor' && <span className="monitor-mode-badge">Live loop</span>}
      {data.kind === 'parallel' && <span className="parallel-mode-badge">Fan out</span>}
      {data.kind === 'diagram' && <span className="diagram-mode-badge">Subgraph</span>}
      {data.kind === 'control' && <span className="control-mode-badge">Player</span>}
      {explorerPolicy && <span className="explorer-mode-badge">{explorerPolicy.scope === 'dataset' ? 'Focus' : 'Catalog'}</span>}
      {workerPolicy && <span className="worker-mode-badge">{workerPolicy.role} · {workerPolicy.concurrency}×</span>}
      {risk && <span className={`risk-mode-badge severity-${risk.severity ?? 'unknown'}`}>{risk.riskType ?? 'risk'} · {risk.severity ?? 'unscored'}</span>}
      {data.runState === 'running' && <span className="run-badge is-running"><LoaderCircle size={10} /> Running</span>}
      {data.runState === 'completed' && <span className="run-badge is-complete">#{data.runSequence}</span>}
      {data.runState === 'waiting' && <span className="run-badge is-waiting"><CirclePause size={10} /> Review</span>}
      {data.runState === 'failed' && <span className="run-badge is-failed"><CircleX size={10} /> Failed</span>}
      {data.runState === 'stopped' && <span className="run-badge is-stopped"><CircleStop size={10} /> Stopped</span>}
      {data.status === 'healthy' && <CheckCircle2 className="healthy-icon" size={14} />}
    </header>
    <strong>{data.label}</strong>
    <p>{data.description}</p>
    {data.profile && <div className="profile-summary" aria-label="Compact data profile">
      <span><strong>{data.profile.fieldCount}</strong> fields</span>
      <span><strong>{data.profile.sensitiveFieldCount}</strong> sensitive</span>
      <span><strong>{data.profile.anomalies.length}</strong> signals</span>
      <span><strong>~{data.profile.tokenEstimate}</strong> tokens</span>
    </div>}
    {risk && <div className="risk-summary" aria-label="Evidence-backed risk context">
      <span><strong>{risk.affectedAssets ?? '—'}</strong> affected</span>
      <span><strong>{risk.confidence === undefined ? '—' : `${Math.round(risk.confidence * 100)}%`}</strong> confidence</span>
      <span><strong>{risk.evidence ?? '—'}</strong> evidence</span>
      <span><strong>{risk.scope || '—'}</strong> scope</span>
    </div>}
    {exploration && <div className="explorer-summary" aria-label="Catalog exploration progress">
      <div className="explorer-progress-track"><i style={{ width: `${exploration.total ? Math.min(100, Math.round((exploration.inspected / exploration.total) * 100)) : 0}%` }} /></div>
      <span><strong>{exploration.inspected}/{exploration.total || '?'}</strong> inspected</span>
      <span><strong>{exploration.remaining ?? Math.max(0, exploration.total - exploration.inspected)}</strong> queued</span>
      <span><strong>{exploration.concurrency}</strong> workers</span>
      <span><strong>{exploration.incidents}</strong> data incidents</span>
      <small>{explorerPolicy?.scope === 'dataset' ? 'Direct dataset fast path' : `Batch ${exploration.batchSize ?? explorerPolicy?.batchSize ?? 8}`} · {exploration.cacheMode ?? explorerPolicy?.cacheMode ?? 'prefer'} cache</small>
    </div>}
    {workerPolicy && <div className="worker-summary" aria-label="Bounded worker policy">
      <span><strong>{workerPolicy.batchSize}</strong> batch</span>
      <span><strong>{workerPolicy.concurrency}</strong> concurrent</span>
      <small>{workerPolicy.context.replace('_', ' ')} · {workerPolicy.merge} merge · {workerPolicy.retry} recovery</small>
    </div>}
    {data.rule && <code>{data.rule}</code>}
    <footer>
      <span>{data.owner}</span>
      {(data.assetRef || data.datahubUrn) && <span className="datahub-badge">{data.sourceSystem ?? 'DataHub'}</span>}
    </footer>
    {!isOutput && !isSplit && !isSystem && <Handle className="pipeline-handle" position={Position.Right} type="source" />}
    {isOutput && <>
      <Handle className="pipeline-handle output-feedback" id="feedback" position={Position.Right} type="source" />
      <span className="feedback-label">feedback</span>
    </>}
    {isSplit && <>
      <Handle className="pipeline-handle split-approved" id="approved" position={Position.Right} type="source" />
      <Handle className="pipeline-handle split-quarantine" id="quarantine" position={Position.Right} type="source" />
      <span className="split-label approved-label">approved</span>
      <span className="split-label quarantine-label">quarantine</span>
    </>}
  </article>
}

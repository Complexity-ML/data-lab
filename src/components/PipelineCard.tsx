import { Handle, Position, type NodeProps } from '@xyflow/react'
import { BrainCircuit, ChartColumn, ChartNetwork, CheckCircle2, CirclePause, CircleStop, CircleX, Database, Dices, GitBranch, LoaderCircle, SearchCheck, Send, Sparkles, UserCheck, WandSparkles } from 'lucide-react'
import type { PipelineNode } from '../domain/pipeline'

const icons = {
  source: Database,
  profile: ChartColumn,
  analysis: BrainCircuit,
  impact: ChartNetwork,
  split: GitBranch,
  decision: Dices,
  transform: WandSparkles,
  review: UserCheck,
  validation: SearchCheck,
  output: Send,
}

export function PipelineCard({ data, selected }: NodeProps<PipelineNode>) {
  const Icon = icons[data.kind]
  const isSplit = data.kind === 'split'
  const isOutput = data.kind === 'output'
  const isSource = data.kind === 'source'
  const isProfile = data.kind === 'profile'

  return <article className={`pipeline-card card-${data.kind} status-${data.status} run-${data.runState ?? 'idle'} ${selected ? 'is-selected' : ''}`}>
    {!isSource && !isProfile && <Handle className="pipeline-handle" position={Position.Left} type="target" />}
    <header>
      <span className="card-icon"><Icon size={16} /></span>
      <span className="card-kind">{data.kind}</span>
      {data.agentAdded && <span className="agent-badge"><Sparkles size={11} /> Agent</span>}
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
    {data.rule && <code>{data.rule}</code>}
    <footer>
      <span>{data.owner}</span>
      {data.datahubUrn && <span className="datahub-badge">DataHub</span>}
    </footer>
    {!isOutput && !isSplit && !isProfile && <Handle className="pipeline-handle" position={Position.Right} type="source" />}
    {isSplit && <>
      <Handle className="pipeline-handle split-approved" id="approved" position={Position.Right} type="source" />
      <Handle className="pipeline-handle split-quarantine" id="quarantine" position={Position.Right} type="source" />
      <span className="split-label approved-label">approved</span>
      <span className="split-label quarantine-label">quarantine</span>
    </>}
  </article>
}

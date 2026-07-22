import { Handle, Position, type NodeProps } from '@xyflow/react'
import { BrainCircuit, CheckCircle2, CirclePause, Database, Dices, GitBranch, LoaderCircle, SearchCheck, Send, Sparkles, UserCheck, WandSparkles } from 'lucide-react'
import type { PipelineNode } from '../domain/pipeline'

const icons = {
  source: Database,
  analysis: BrainCircuit,
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

  return <article className={`pipeline-card card-${data.kind} status-${data.status} run-${data.runState ?? 'idle'} ${selected ? 'is-selected' : ''}`}>
    {!isSource && <Handle className="pipeline-handle" position={Position.Left} type="target" />}
    <header>
      <span className="card-icon"><Icon size={16} /></span>
      <span className="card-kind">{data.kind}</span>
      {data.agentAdded && <span className="agent-badge"><Sparkles size={11} /> Agent</span>}
      {data.runState === 'running' && <span className="run-badge is-running"><LoaderCircle size={10} /> Running</span>}
      {data.runState === 'completed' && <span className="run-badge is-complete">#{data.runSequence}</span>}
      {data.runState === 'waiting' && <span className="run-badge is-waiting"><CirclePause size={10} /> Review</span>}
      {data.status === 'healthy' && <CheckCircle2 className="healthy-icon" size={14} />}
    </header>
    <strong>{data.label}</strong>
    <p>{data.description}</p>
    {data.rule && <code>{data.rule}</code>}
    <footer>
      <span>{data.owner}</span>
      {data.datahubUrn && <span className="datahub-badge">DataHub</span>}
    </footer>
    {!isOutput && !isSplit && <Handle className="pipeline-handle" position={Position.Right} type="source" />}
    {isSplit && <>
      <Handle className="pipeline-handle split-approved" id="approved" position={Position.Right} type="source" />
      <Handle className="pipeline-handle split-quarantine" id="quarantine" position={Position.Right} type="source" />
      <span className="split-label approved-label">approved</span>
      <span className="split-label quarantine-label">quarantine</span>
    </>}
  </article>
}

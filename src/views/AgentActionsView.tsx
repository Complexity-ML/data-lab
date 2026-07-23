import { CheckCircle2, Clock3, LoaderCircle, PanelRightClose, Pause, Play, Square } from 'lucide-react'
import { PanelHeader } from '../components/shared/PanelHeader'
import type { AgentPlayerState } from '../components/AppHeader'

export interface AgentActionLog {
  id: string
  message: string
  createdAt: string
}

interface AgentActionsViewProps {
  busy: boolean
  history: AgentActionLog[]
  onClose(): void
  playerState: AgentPlayerState
}

export function AgentActionsView({ busy, history, onClose, playerState }: AgentActionsViewProps) {
  const StateIcon = playerState === 'running' ? Play : playerState === 'paused' ? Pause : Square
  return <>
    <PanelHeader action={<button aria-label="Close agent actions" className="panel-toggle" onClick={onClose} title="Close agent actions" type="button"><PanelRightClose size={16} /></button>} eyebrow="ACT" title="Agent actions" />
    <div className="actions-panel-content">
      <section className={`action-current ${busy ? 'is-busy' : ''}`}>
        <span>{busy ? <LoaderCircle className="agent-context-wheel" size={18} /> : <StateIcon size={18} />}</span>
        <div><small>CURRENT STATE</small><strong>{busy ? 'Agent iteration in progress' : `Player ${playerState}`}</strong><p>{history[0]?.message ?? 'No agent action recorded yet.'}</p></div>
      </section>
      <div className="action-history-heading"><strong>Action timeline</strong><small>{history.length} step{history.length === 1 ? '' : 's'}</small></div>
      {history.length ? <ol className="action-history">{history.map((entry, index) => <li key={entry.id}>
        <span>{index === 0 && busy ? <LoaderCircle className="agent-context-wheel" size={13} /> : index === 0 ? <Clock3 size={13} /> : <CheckCircle2 size={13} />}</span>
        <div><strong>{entry.message}</strong><small>{new Date(entry.createdAt).toLocaleTimeString()}</small></div>
      </li>)}</ol> : <p className="empty-copy">Play the autonomous agent to record its graph iterations here.</p>}
    </div>
  </>
}

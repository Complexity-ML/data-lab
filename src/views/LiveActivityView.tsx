import { CheckCircle2, Clock3, LoaderCircle, PanelLeftClose, ScrollText } from 'lucide-react'
import { PanelHeader } from '../components/shared/PanelHeader'
import type { AgentActionLog } from './AgentActionsView'

interface LiveActivityViewProps {
  busy: boolean
  entries: AgentActionLog[]
  onClose(): void
}

export function LiveActivityView({ busy, entries, onClose }: LiveActivityViewProps) {
  return <>
    <PanelHeader action={<button aria-label="Close live logs" className="panel-toggle" onClick={onClose} title="Close live logs" type="button"><PanelLeftClose size={16} /></button>} eyebrow="LIVE" title="Activity log" />
    <div className="live-log-content">
      <div className={`live-log-state ${busy ? 'is-busy' : ''}`}>
        {busy ? <LoaderCircle className="agent-context-wheel" size={17} /> : <ScrollText size={17} />}
        <span><strong>{busy ? 'DATA LAB is working' : 'Waiting for the next event'}</strong><small>Simple session timeline · newest first</small></span>
      </div>
      {entries.length ? <ol className="live-log-list">{entries.map((entry, index) => <li key={entry.id}>
        <span>{index === 0 && busy ? <LoaderCircle className="agent-context-wheel" size={12} /> : index === 0 ? <Clock3 size={12} /> : <CheckCircle2 size={12} />}</span>
        <div><strong>{entry.message}</strong><time>{new Date(entry.createdAt).toLocaleTimeString()}</time></div>
      </li>)}</ol> : <p className="empty-copy">Play the graph or change a setting to start the live timeline.</p>}
    </div>
  </>
}

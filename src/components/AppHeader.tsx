import { Boxes, Settings, Sparkles } from 'lucide-react'
import { ActionButton } from './shared/ActionButton'

interface AppHeaderProps {
  agentRunning: boolean
  cardCount: number
  onOpenSettings(): void
  onRun(): void
  projectTitle: string
}

export function AppHeader({ agentRunning, cardCount, onOpenSettings, onRun, projectTitle }: AppHeaderProps) {
  return <header className="topbar">
    <div className="brand"><span className="brand-mark"><Boxes size={18} /></span><div><strong>DATA LAB</strong><small>Context-aware pipeline studio</small></div></div>
    <div className="project-title"><span>{projectTitle}</span><small>{cardCount ? 'Unsaved draft' : 'Empty canvas'}</small></div>
    <div className="topbar-actions">
      <ActionButton disabled={agentRunning || cardCount === 0} icon={<Sparkles size={15} />} onClick={onRun} title={cardCount === 0 ? 'Add a Data Source card before running the agent flow' : 'Run the agent flow'} variant="primary">{agentRunning ? 'Agent working…' : 'Run agent flow'}</ActionButton>
      <button aria-label="Open settings" className="settings-trigger" onClick={onOpenSettings} title="Settings" type="button"><Settings size={17} /></button>
    </div>
  </header>
}

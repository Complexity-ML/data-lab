import { AgentPrompt } from './shared/AgentPrompt'

interface AppFooterProps {
  activity: string
  agentRunning: boolean
  connected: boolean
  context: { cards: number; edges: number; versions: number; mcp: string; model: string }
  onOpenAiSettings(): void
  onStop(): void
  onSubmit(prompt: string): void
}

export function AppFooter({ activity, agentRunning, connected, context, onOpenAiSettings, onStop, onSubmit }: AppFooterProps) {
  return <footer className="statusbar">
    <span className="status-activity">{activity}</span>
    <AgentPrompt activity={activity} busy={agentRunning} connected={connected} context={context} onOpenSettings={onOpenAiSettings} onStop={onStop} onSubmit={onSubmit} />
    <span className="status-review">Human review <strong>notified</strong> when Agent Decision requests it</span>
  </footer>
}

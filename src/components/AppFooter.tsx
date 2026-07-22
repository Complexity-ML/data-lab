import { AgentPrompt } from './shared/AgentPrompt'
import { useLanguage } from '../i18n'

interface AppFooterProps {
  activity: string
  agentRunning: boolean
  connected: boolean
  context: { ai?: string; cards: number; edges: number; versions: number; mcp: string; model: string }
  onOpenAiSettings(): void
  onStop(): void
  onSubmit(prompt: string): void
}

export function AppFooter({ activity, agentRunning, connected, context, onOpenAiSettings, onStop, onSubmit }: AppFooterProps) {
  const { t } = useLanguage()
  return <footer className="statusbar">
    <span className="status-activity">{activity}</span>
    <AgentPrompt activity={activity} busy={agentRunning} connected={connected} context={context} onOpenSettings={onOpenAiSettings} onStop={onStop} onSubmit={onSubmit} />
    <span className="status-review">{t('humanReview')} <strong>{t('notified')}</strong> {t('reviewWhen')}</span>
  </footer>
}

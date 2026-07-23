import { Boxes, Settings, Sparkles } from 'lucide-react'
import { ActionButton } from './shared/ActionButton'
import type { WorkspaceSaveState } from '../domain/workspace'
import { useLanguage } from '../i18n'

interface AppHeaderProps {
  agentRunning: boolean
  cardCount: number
  onOpenSettings(): void
  onRun(): void
  projectTitle: string
  saveState: WorkspaceSaveState
}

export function AppHeader({ agentRunning, cardCount, onOpenSettings, onRun, projectTitle, saveState }: AppHeaderProps) {
  const { t } = useLanguage()
  return <header className="topbar">
    <div className="brand"><span className="brand-mark"><Boxes size={18} /></span><div><strong>DATA LAB</strong><small>{t('appSubtitle')}</small></div></div>
    <div className="project-title"><span>{projectTitle}</span><small className={`header-save-state ${saveState}`}>{saveState === 'recovering' ? t('recoveryAvailable') : saveState === 'saved' ? t('saved') : `${t('unsaved')}${cardCount === 0 ? ` · ${t('emptyCanvas')}` : ''}`}</small></div>
    <div className="topbar-actions">
      <ActionButton disabled={agentRunning} icon={<Sparkles size={15} />} onClick={onRun} title={cardCount === 0 ? 'Discover an available governed source and propose an initial graph' : t('runHint')} variant="primary">{agentRunning ? t('agentWorking') : t('runAgent')}</ActionButton>
      <button aria-label={t('openSettings')} className="settings-trigger" onClick={onOpenSettings} title={t('openSettings')} type="button"><Settings size={17} /></button>
    </div>
  </header>
}

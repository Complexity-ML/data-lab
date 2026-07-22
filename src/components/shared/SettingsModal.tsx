import { AlertTriangle, CheckCircle2, Database, History, Moon, Network, Palette, Play, RotateCcw, Save, Settings, Sun, X } from 'lucide-react'
import { useState } from 'react'
import { ActionButton } from './ActionButton'
import { Modal } from './Modal'

interface SettingsModalProps {
  connectionMode: 'demo' | 'connected'
  errorCount: number
  findingCount: number
  mcpMessage: string
  mcpTransport: 'demo' | 'http' | 'stdio'
  onAutoLayout: () => void
  onClose: () => void
  onSyncDataHub: () => void
  onValidate: () => void
  onThemeChange: (theme: 'light' | 'dark') => void
  onRestoreVersion: (versionId: string) => void
  onSaveVersion: () => void
  theme: 'light' | 'dark'
  versions: { id: string; label: string; createdAt: string; origin: 'initial' | 'agent' | 'manual'; blockingIssues: number }[]
}

export function SettingsModal({ connectionMode, errorCount, findingCount, mcpMessage, mcpTransport, onAutoLayout, onClose, onRestoreVersion, onSaveVersion, onSyncDataHub, onThemeChange, onValidate, theme, versions }: SettingsModalProps) {
  const [activeSection, setActiveSection] = useState<'appearance' | 'datahub' | 'pipeline' | 'versions'>('appearance')
  return <Modal ariaLabelledby="settings-title" className="settings-modal" onClose={onClose}>
      <header className="settings-heading">
        <span><Settings size={19} /></span>
        <div><small>WORKSPACE</small><h2 id="settings-title">Settings</h2><p>Appearance, DataHub MCP, pipeline tools and version history.</p></div>
        <button aria-label="Close settings" className="settings-close" onClick={onClose} type="button"><X size={18} /></button>
      </header>

      <div className="settings-body">
        <nav aria-label="Settings sections" className="settings-sidebar">
          <small>SETTINGS MENU</small>
          <button aria-current={activeSection === 'appearance' ? 'page' : undefined} className={activeSection === 'appearance' ? 'is-active' : ''} onClick={() => setActiveSection('appearance')} type="button"><Palette size={17} /><span><strong>Appearance</strong><small>Theme and interface</small></span></button>
          <button aria-current={activeSection === 'datahub' ? 'page' : undefined} className={activeSection === 'datahub' ? 'is-active' : ''} onClick={() => setActiveSection('datahub')} type="button"><Database size={17} /><span><strong>DataHub MCP</strong><small>Agent context server</small></span></button>
          <button aria-current={activeSection === 'pipeline' ? 'page' : undefined} className={activeSection === 'pipeline' ? 'is-active' : ''} onClick={() => setActiveSection('pipeline')} type="button"><Network size={17} /><span><strong>Pipeline</strong><small>Layout and validation</small></span></button>
          <button aria-current={activeSection === 'versions' ? 'page' : undefined} className={activeSection === 'versions' ? 'is-active' : ''} onClick={() => setActiveSection('versions')} type="button"><History size={17} /><span><strong>Versions</strong><small>Safe graph checkpoints</small></span></button>
          <div className="settings-sidebar-status"><span className={connectionMode} /><div><strong>Agent context</strong><small>{connectionMode === 'connected' ? `MCP ${mcpTransport}` : mcpTransport === 'demo' ? 'Local demo mode' : `MCP ${mcpTransport} ready`}</small></div></div>
        </nav>

        <div className="settings-content">
          {activeSection === 'appearance' && <article className="settings-page">
            <div className="settings-page-heading"><small>APPEARANCE</small><h3>Choose your workspace theme</h3><p>The card palette stays consistent; only surfaces and contrast are adjusted.</p></div>
            <section className="settings-section settings-appearance">
              <div className="settings-section-title"><span>Color mode</span><small>Local to this device</small></div>
              <div aria-label="Color theme" className="theme-switch" role="group">
                <button aria-pressed={theme === 'light'} className={theme === 'light' ? 'is-active' : ''} onClick={() => onThemeChange('light')} type="button"><Sun size={20} /><span><strong>Light</strong><small>Clear and bright workspace</small></span></button>
                <button aria-pressed={theme === 'dark'} className={theme === 'dark' ? 'is-active' : ''} onClick={() => onThemeChange('dark')} type="button"><Moon size={20} /><span><strong>Dark</strong><small>Soft slate workspace</small></span></button>
              </div>
            </section>
          </article>}

          {activeSection === 'datahub' && <article className="settings-page">
            <div className="settings-page-heading"><small>DATAHUB MCP</small><h3>Agent context server</h3><p>Give agents trusted schema, ownership and lineage context through the Model Context Protocol.</p></div>
            <section className="settings-section">
              <div className="settings-section-title"><span>MCP connection</span><small>{mcpTransport === 'demo' ? 'Not configured' : mcpTransport === 'http' ? 'Streamable HTTP' : 'Local stdio'}</small></div>
              <div className="settings-setting-row">
                <div className={`settings-icon datahub-${connectionMode}`}><Database size={19} /></div>
                <div><strong>DataHub MCP {connectionMode === 'connected' ? 'connected' : mcpTransport === 'demo' ? 'demo mode' : 'ready'}</strong><p>{mcpMessage}</p></div>
                <ActionButton onClick={onSyncDataHub} variant="ghost">{connectionMode === 'connected' ? 'Sync now' : 'Connect'}</ActionButton>
              </div>
            </section>
          </article>}

          {activeSection === 'pipeline' && <article className="settings-page">
            <div className="settings-page-heading"><small>PIPELINE</small><h3>Graph tools and validation</h3><p>Maintain a readable topology and verify every rule atomically.</p></div>
            <section className="settings-section">
              <div className="settings-section-title"><span>Pipeline tools</span><small>Safe workspace actions</small></div>
              <div className="settings-tools">
                <button onClick={onAutoLayout} type="button"><span><Network size={18} /></span><div><strong>Auto layout</strong><small>Recalculate topology-aware XY placement.</small></div></button>
                <button onClick={onValidate} type="button"><span><Play size={18} /></span><div><strong>Run validation</strong><small>{findingCount} findings · {errorCount} blocking.</small></div><em className={errorCount ? 'has-errors' : 'is-clear'}>{errorCount ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}</em></button>
              </div>
            </section>
          </article>}

          {activeSection === 'versions' && <article className="settings-page">
            <div className="settings-page-heading settings-heading-with-action"><div><small>VERSIONS</small><h3>Pipeline checkpoints</h3><p>Agent changes are committed only after atomic validation succeeds.</p></div><ActionButton icon={<Save size={15} />} onClick={onSaveVersion} variant="primary">Save checkpoint</ActionButton></div>
            <section className="settings-section version-list">
              <div className="settings-section-title"><span>Version history</span><small>{versions.length} saved</small></div>
              <ol>{[...versions].reverse().map((version, index) => <li key={version.id}>
                <span className={`version-origin origin-${version.origin}`}>{version.origin}</span>
                <div><strong>{version.label}</strong><small>{new Date(version.createdAt).toLocaleString()} · {version.blockingIssues ? `${version.blockingIssues} blocking` : 'atomic checks passed'}</small></div>
                <button disabled={index === 0} onClick={() => onRestoreVersion(version.id)} title={index === 0 ? 'Current version' : `Restore ${version.label}`} type="button"><RotateCcw size={14} />{index === 0 ? 'Current' : 'Restore'}</button>
              </li>)}</ol>
            </section>
          </article>}
        </div>
      </div>
  </Modal>
}

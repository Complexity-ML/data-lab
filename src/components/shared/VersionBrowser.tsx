import { AlertTriangle, CheckCircle2, Clock3, GitBranch, RotateCcw, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ActionButton } from './ActionButton'

export interface VersionSummary {
  id: string
  label: string
  createdAt: string
  origin: 'initial' | 'agent' | 'manual'
  blockingIssues: number
  status?: 'committed' | 'pending-review' | 'rejected'
  description?: string
}

export function VersionBrowser({ onRestore, versions }: { onRestore(versionId: string): void; versions: VersionSummary[] }) {
  const preferred = useMemo(() => [...versions].reverse().find((version) => version.status === 'pending-review') ?? versions.at(-1), [versions])
  const [selectedId, setSelectedId] = useState(preferred?.id)
  useEffect(() => { if (preferred) setSelectedId(preferred.id) }, [preferred?.id])
  const selected = versions.find((version) => version.id === selectedId) ?? preferred

  if (!selected) return <div className="version-browser-empty"><GitBranch size={24} /><strong>No version yet</strong><p>Save a checkpoint or ask the agent to propose an improvement.</p></div>
  const status = selected.status ?? 'committed'

  return <div className="version-browser">
    <aside aria-label="Pipeline versions" className="version-browser-sidebar">
      <header><strong>All versions</strong><small>{versions.length} revisions</small></header>
      <ol>{[...versions].reverse().map((version) => <li key={version.id}><button aria-current={version.id === selected.id ? 'true' : undefined} onClick={() => setSelectedId(version.id)} type="button"><span className={`version-dot version-dot-${version.status ?? 'committed'}`} /> <div><strong>{version.label}</strong><small>{new Date(version.createdAt).toLocaleString()}</small></div><em>{version.status === 'pending-review' ? 'review' : version.status === 'rejected' ? 'rejected' : version.origin}</em></button></li>)}</ol>
    </aside>
    <article className="version-browser-detail">
      <header><span className={`version-status status-${status}`}>{status === 'pending-review' ? <Clock3 size={14} /> : status === 'rejected' ? <XCircle size={14} /> : <CheckCircle2 size={14} />}{status.replace('-', ' ')}</span><time>{new Date(selected.createdAt).toLocaleString()}</time></header>
      <small>REVISION COMMENT</small>
      <h4>{selected.label}</h4>
      <p>{selected.description ?? 'Manual pipeline checkpoint. No agent comment was attached to this revision.'}</p>
      <dl><div><dt>Origin</dt><dd>{selected.origin}</dd></div><div><dt>Atomic validation</dt><dd className={selected.blockingIssues ? 'has-errors' : ''}>{selected.blockingIssues ? <><AlertTriangle size={13} />{selected.blockingIssues} blocking issue(s)</> : <><CheckCircle2 size={13} />Checks passed</>}</dd></div><div><dt>Branch state</dt><dd>{status === 'pending-review' ? 'Paused until the named human decides' : status === 'rejected' ? 'Stopped — active graph was not changed' : 'Committed and restorable'}</dd></div></dl>
      <div className="version-browser-actions"><ActionButton disabled={status !== 'committed'} icon={<RotateCcw size={14} />} onClick={() => onRestore(selected.id)} variant="primary">{status === 'pending-review' ? 'Waiting for Human Review' : status === 'rejected' ? 'Revision rejected' : 'Restore this version'}</ActionButton></div>
    </article>
  </div>
}

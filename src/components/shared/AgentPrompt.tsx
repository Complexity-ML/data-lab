import { Database, GitCompareArrows, History, ListChecks, Send, ShieldCheck, Sparkles, Square, X } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'

interface AgentPromptProps {
  activity: string
  busy: boolean
  connected: boolean
  context: { cards: number; edges: number; versions: number; mcp: string; model: string }
  onOpenSettings(): void
  onStop(): void
  onSubmit(prompt: string): void
}

export function AgentPrompt({ activity, busy, connected, context, onOpenSettings, onStop, onSubmit }: AgentPromptProps) {
  const [value, setValue] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const height = Math.min(Math.max(textarea.scrollHeight, 32), 88)
    textarea.style.height = `${height}px`
    textarea.style.overflowY = textarea.scrollHeight > 88 ? 'auto' : 'hidden'
  }, [value])

  const submit = () => {
    const request = value.trim()
    if (!request || busy) return
    if (!connected) {
      onOpenSettings()
      return
    }
    onSubmit(request)
    setValue('')
    setDetailsOpen(true)
  }

  return <div className="data-agent-prompt-dock">
    {detailsOpen && <section aria-label="Agentic execution details" className="data-agent-details">
      <header><span><Sparkles size={14} /><strong>Agentic context</strong></span><button aria-label="Close agent details" onClick={() => setDetailsOpen(false)} type="button"><X size={13} /></button></header>
      <div className="agent-context-flow">
        <span><Database size={14} /><strong>DataHub MCP</strong><small>{context.mcp}</small></span>
        <i>→</i>
        <span><History size={14} /><strong>Version memory</strong><small>{context.versions} checkpoint{context.versions === 1 ? '' : 's'}</small></span>
        <i>→</i>
        <span><GitCompareArrows size={14} /><strong>Graph proposal</strong><small>{context.cards} cards · {context.edges} edges</small></span>
        <i>→</i>
        <span><ShieldCheck size={14} /><strong>Human Review</strong><small>Atomic approval</small></span>
      </div>
      <p className={busy ? 'is-running' : ''}>{busy && <Sparkles size={12} />}{activity}</p>
    </section>}
    <form className="data-agent-prompt" onSubmit={(event) => { event.preventDefault(); submit() }}>
      <textarea
        aria-label="What should the DATA LAB agent do?"
        disabled={busy}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
          event.preventDefault()
          submit()
        }}
        placeholder={connected ? 'Ask the agent to analyze, rebuild or improve this data pipeline…' : 'Connect OpenAI in Settings to activate the agent…'}
        ref={textareaRef}
        rows={1}
        value={value}
      />
      <div className="data-agent-prompt-context"><span><Sparkles size={11} />DATA LAB agent</span><small>{connected ? `${context.model} · Review only · ${context.mcp}` : 'No simulated action · connection required'}</small></div>
      <div className="data-agent-actions">
        {busy
          ? <button aria-label="Emergency stop agent" className="data-agent-send is-stop" onClick={onStop} title="Stop the current agent run immediately" type="button"><Square size={13} /></button>
          : <button aria-label="Send request to DATA LAB agent" className="data-agent-send" disabled={!value.trim()} title={connected ? 'Propose graph changes' : 'Open Settings to connect'} type="submit"><Send size={15} /></button>}
        <button aria-expanded={detailsOpen} aria-label="Show agentic details" className="data-agent-detail-button" onClick={() => setDetailsOpen((current) => !current)} title="Agentic details" type="button"><ListChecks size={14} /><b>{busy ? '…' : context.versions}</b></button>
      </div>
    </form>
  </div>
}

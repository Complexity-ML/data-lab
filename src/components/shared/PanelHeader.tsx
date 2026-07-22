import type { ReactNode } from 'react'

interface PanelHeaderProps {
  eyebrow: string
  title: string
  action?: ReactNode
}

export function PanelHeader({ action, eyebrow, title }: PanelHeaderProps) {
  return <div className="panel-heading"><div><small>{eyebrow}</small><h2>{title}</h2></div>{action}</div>
}

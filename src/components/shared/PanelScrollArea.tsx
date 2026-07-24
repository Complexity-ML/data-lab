import type { ReactNode } from 'react'

interface PanelScrollAreaProps {
  children: ReactNode
  className?: string
  label: string
}

export function PanelScrollArea({ children, className, label }: PanelScrollAreaProps) {
  return <div aria-label={label} className={`panel-scroll-area${className ? ` ${className}` : ''}`} role="region" tabIndex={0}>
    {children}
  </div>
}

import { useEffect, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  ariaLabelledby: string
  children: ReactNode
  className?: string
  onClose: () => void
}

export function Modal({ ariaLabelledby, children, className = '', onClose }: ModalProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.body.classList.add('has-modal')
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.classList.remove('has-modal')
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  const closeFromBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.currentTarget === event.target) onClose()
  }

  return createPortal(<div className="modal-backdrop" onMouseDown={closeFromBackdrop}>
    <section aria-labelledby={ariaLabelledby} aria-modal="true" className={`modal-shell ${className}`.trim()} role="dialog">{children}</section>
  </div>, document.body)
}

export const toastEventName = 'data-lab:toast'

export type ToastTone = 'error' | 'info' | 'success' | 'warning'

export interface ToastEventDetail {
  message: string
  title: string
  tone: ToastTone
}

export function errorMessage(error: unknown, fallback = 'An unexpected error occurred') {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (typeof error === 'string' && error.trim()) return error.trim()
  return fallback
}

export function notifyToast(message: string, tone: ToastTone = 'info', title?: string) {
  if (typeof window === 'undefined') return
  const normalized = message.trim().slice(0, 480)
  if (!normalized) return
  window.dispatchEvent(new CustomEvent<ToastEventDetail>(toastEventName, { detail: { message: normalized, tone, title: title ?? (tone === 'error' ? 'Something went wrong' : tone === 'warning' ? 'Attention needed' : tone === 'success' ? 'Completed' : 'DATA LAB') } }))
}

export function notifyError(error: unknown, fallback?: string) {
  notifyToast(errorMessage(error, fallback), 'error')
}

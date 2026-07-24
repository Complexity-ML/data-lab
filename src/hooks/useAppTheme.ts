import { useEffect, useState } from 'react'

export function useAppTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => window.localStorage.getItem('data-lab-theme') === 'dark' ? 'dark' : 'light')
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('data-lab-theme', theme)
  }, [theme])
  return [theme, setTheme] as const
}

import { useCallback, useEffect, useState } from 'react'

export function useBackgroundMonitoring(setActivity: (message: string) => void) {
  const [enabled, setEnabledState] = useState(true)

  useEffect(() => {
    if (!window.dataLab?.getBackgroundMonitoringStatus) return
    void window.dataLab.getBackgroundMonitoringStatus()
      .then((status) => setEnabledState(status.enabled))
      .catch(() => undefined)
  }, [])

  const setEnabled = useCallback(async (next: boolean) => {
    if (!window.dataLab) {
      setEnabledState(next)
      return
    }
    const status = await window.dataLab.saveBackgroundMonitoring(next)
    setEnabledState(status.enabled)
    setActivity(status.message)
  }, [setActivity])

  return { enabled, setEnabled }
}

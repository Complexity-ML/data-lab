import { useEffect, useMemo, useRef } from 'react'
import type { Edge } from '@xyflow/react'
import type { DataHubMcpAudit } from '../electron-api'
import type { IncidentEventInput } from '../domain/incidents'
import { evaluateMonitorObservation, findBoundLiveMonitors, liveMonitorBindingKey, observeDataHubAudit, type BoundLiveMonitor, type MonitorRuntimeState } from '../domain/live-monitor'
import type { PipelineNode } from '../domain/pipeline'

export interface LiveIncidentTrigger {
  audit: DataHubMcpAudit
  incidentKey: string
  monitor: BoundLiveMonitor
}

interface UseLiveIncidentMonitorOptions {
  active: boolean
  agentBlocked: boolean
  nodes: PipelineNode[]
  edges: Edge[]
  audit(urn: string): Promise<DataHubMcpAudit>
  onIncident(event: IncidentEventInput): Promise<void>
  onTrigger(trigger: LiveIncidentTrigger): Promise<void>
}

export function useLiveIncidentMonitor({ active, agentBlocked, nodes, edges, audit, onIncident, onTrigger }: UseLiveIncidentMonitorOptions) {
  const monitors = useMemo(() => findBoundLiveMonitors(nodes, edges), [edges, nodes])
  const callbacks = useRef({ audit, onIncident, onTrigger })
  const blocked = useRef(agentBlocked)
  const runtime = useRef(new Map<string, MonitorRuntimeState>())
  const nextRead = useRef(new Map<string, number>())
  const reading = useRef(new Set<string>())
  const triggering = useRef(false)

  useEffect(() => { callbacks.current = { audit, onIncident, onTrigger } }, [audit, onIncident, onTrigger])
  useEffect(() => { blocked.current = agentBlocked }, [agentBlocked])

  useEffect(() => {
    if (!active || monitors.length === 0) return
    let disposed = false

    const tick = async () => {
      const now = Date.now()
      for (const monitor of monitors) {
        const bindingKey = liveMonitorBindingKey(monitor)
        if (disposed || reading.current.has(bindingKey) || (nextRead.current.get(bindingKey) ?? 0) > now) continue
        reading.current.add(bindingKey)
        nextRead.current.set(bindingKey, now + monitor.policy.cooldownMs)
        try {
          const auditResult = await callbacks.current.audit(monitor.urn)
          if (disposed) return
          const observation = observeDataHubAudit(auditResult)
          const decision = evaluateMonitorObservation(runtime.current.get(bindingKey), observation, monitor.policy)
          runtime.current.set(bindingKey, decision.next)
          if (!decision.transition) continue
          const incidentKey = `live-monitor:${monitor.monitorId}:${monitor.urn}`
          const detail = decision.transition === 'recovered'
            ? `All ${observation.totalReads} monitored DataHub reads returned to normal.`
            : `${observation.failedReads}/${observation.totalReads} monitored DataHub reads are unavailable or stale. Fingerprint ${observation.fingerprint}.`
          await callbacks.current.onIncident({
            incidentKey,
            transition: decision.transition,
            severity: observation.severity,
            title: `${monitor.monitorLabel} · ${monitor.sourceLabel}`,
            detail,
            fingerprint: observation.fingerprint,
            cardId: monitor.monitorId,
            branchId: monitor.monitorId,
          })
          if (decision.triggerAgent && !blocked.current && !triggering.current) {
            triggering.current = true
            try { await callbacks.current.onTrigger({ audit: auditResult, incidentKey, monitor }) }
            finally { triggering.current = false }
          }
        } catch (error) {
          if (!disposed) {
            const incidentKey = `live-monitor:${monitor.monitorId}:${monitor.urn}`
            await callbacks.current.onIncident({
              incidentKey,
              transition: runtime.current.get(bindingKey)?.open ? 'worsened' : 'opened',
              severity: 'critical',
              title: `${monitor.monitorLabel} · monitoring unavailable`,
              detail: error instanceof Error ? error.message : 'DataHub monitoring failed.',
              fingerprint: 'monitor-read-error',
              cardId: monitor.monitorId,
              branchId: monitor.monitorId,
            })
            runtime.current.set(bindingKey, { fingerprint: 'monitor-read-error', severity: 'critical', open: true, iterations: (runtime.current.get(bindingKey)?.iterations ?? 0) + 1 })
          }
        } finally {
          reading.current.delete(bindingKey)
        }
      }
    }

    void tick()
    const timer = window.setInterval(() => void tick(), 2_000)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [active, monitors])
}

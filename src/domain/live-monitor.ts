import type { Edge } from '@xyflow/react'
import type { DataHubMcpAudit } from '../electron-api'
import type { IncidentSeverity, IncidentTransition } from './incidents'
import type { PipelineNode } from './pipeline'

export interface LiveMonitorPolicy {
  cooldownMs: number
  maxIterations: number
}

export interface MonitorObservation {
  fingerprint: string
  severity: IncidentSeverity
  failedReads: number
  totalReads: number
}

export interface MonitorRuntimeState {
  fingerprint?: string
  severity: IncidentSeverity
  open: boolean
  iterations: number
}

export interface MonitorDecision {
  next: MonitorRuntimeState
  transition?: Extract<IncidentTransition, 'opened' | 'worsened' | 'recovered'>
  triggerAgent: boolean
}

export interface BoundLiveMonitor {
  monitorId: string
  monitorLabel: string
  sourceId: string
  sourceLabel: string
  urn: string
  policy: LiveMonitorPolicy
}

const severityRank: Record<IncidentSeverity, number> = { info: 0, warning: 1, critical: 2 }

function stableHash(value: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function parseLiveMonitorPolicy(rule?: string): LiveMonitorPolicy {
  const cooldownSeconds = Number(rule?.match(/cooldown\s*=\s*(\d+)/i)?.[1] ?? 60)
  const maxIterations = Number(rule?.match(/max_iterations\s*=\s*(\d+)/i)?.[1] ?? 10)
  return {
    cooldownMs: Math.min(3_600, Math.max(10, cooldownSeconds)) * 1_000,
    maxIterations: Math.min(100, Math.max(1, maxIterations)),
  }
}

export function observeDataHubAudit(audit: DataHubMcpAudit): MonitorObservation {
  const canonical = audit.reads
    .map((read) => `${read.name}:${read.status}:${read.stale ? 'stale' : 'fresh'}:${read.summary}`)
    .sort()
    .join('|')
  const failedReads = audit.reads.filter((read) => read.status !== 'ok' || read.stale).length
  return {
    fingerprint: stableHash(canonical),
    severity: failedReads === 0 ? 'info' : failedReads === audit.reads.length ? 'critical' : 'warning',
    failedReads,
    totalReads: audit.reads.length,
  }
}

export function evaluateMonitorObservation(previous: MonitorRuntimeState | undefined, observation: MonitorObservation, policy: LiveMonitorPolicy): MonitorDecision {
  const baseline: MonitorRuntimeState = previous ?? { severity: 'info', open: false, iterations: 0 }
  if (baseline.fingerprint === observation.fingerprint && baseline.severity === observation.severity) {
    return { next: baseline, triggerAgent: false }
  }

  if (observation.severity === 'info') {
    return {
      next: { fingerprint: observation.fingerprint, severity: 'info', open: false, iterations: 0 },
      transition: baseline.open ? 'recovered' : undefined,
      triggerAgent: false,
    }
  }

  const transition = baseline.open ? 'worsened' : 'opened'
  const iterations = baseline.iterations + 1
  return {
    next: { fingerprint: observation.fingerprint, severity: observation.severity, open: true, iterations },
    transition,
    triggerAgent: iterations <= policy.maxIterations
      && (!baseline.open || baseline.fingerprint !== observation.fingerprint || severityRank[observation.severity] > severityRank[baseline.severity]),
  }
}

export function findBoundLiveMonitors(nodes: PipelineNode[], edges: Edge[]): BoundLiveMonitor[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const incoming = new Map<string, string[]>()
  for (const edge of edges) {
    if (edge.sourceHandle === 'feedback') continue
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source])
  }

  return nodes.filter((node) => node.data.kind === 'monitor').flatMap((monitor) => {
    const queue = [monitor.id]
    const visited = new Set<string>()
    while (queue.length) {
      const current = queue.shift()!
      if (visited.has(current)) continue
      visited.add(current)
      const node = byId.get(current)
      if (node?.data.kind === 'source' && node.data.datahubUrn) {
        return [{
          monitorId: monitor.id,
          monitorLabel: monitor.data.label,
          sourceId: node.id,
          sourceLabel: node.data.label,
          urn: node.data.datahubUrn,
          policy: parseLiveMonitorPolicy(monitor.data.rule),
        }]
      }
      queue.push(...(incoming.get(current) ?? []))
    }
    return []
  })
}

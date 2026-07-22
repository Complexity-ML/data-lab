import type { Edge } from '@xyflow/react'
import type { PipelineNode } from './pipeline'
import type { ValidationIssue } from '../validation'

export interface PipelineVersion {
  id: string
  label: string
  createdAt: string
  origin: 'initial' | 'agent' | 'manual'
  nodes: PipelineNode[]
  edges: Edge[]
  blockingIssues: number
}

function copyGraph<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function createPipelineVersion(nodes: PipelineNode[], edges: Edge[], label: string, origin: PipelineVersion['origin'], issues: ValidationIssue[]): PipelineVersion {
  return {
    id: `version-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    createdAt: new Date().toISOString(),
    origin,
    nodes: copyGraph(nodes),
    edges: copyGraph(edges),
    blockingIssues: issues.filter((issue) => issue.severity === 'error').length,
  }
}

export function appendPipelineVersion(versions: PipelineVersion[], version: PipelineVersion, limit = 12): PipelineVersion[] {
  return [...versions, version].slice(-limit)
}

export function restorePipelineVersion(version: PipelineVersion): { nodes: PipelineNode[]; edges: Edge[] } {
  return { nodes: copyGraph(version.nodes), edges: copyGraph(version.edges) }
}

export function readPipelineVersions(serialized: string | null): PipelineVersion[] {
  if (!serialized) return []
  try {
    const parsed = JSON.parse(serialized) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is PipelineVersion => Boolean(item)
      && typeof item === 'object'
      && typeof item.id === 'string'
      && typeof item.label === 'string'
      && Array.isArray(item.nodes)
      && Array.isArray(item.edges))
  } catch {
    return []
  }
}

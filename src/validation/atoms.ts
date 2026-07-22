import type { CardKind } from '../domain/pipeline'
import type { ValidationAtom, ValidationContext, ValidationIssue } from './types'

function issue(atomId: string, value: Omit<ValidationIssue, 'atomId'>): ValidationIssue {
  return { atomId, ...value }
}

function containsCycle({ nodes, edges }: ValidationContext): boolean {
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]))
  for (const edge of edges) adjacency.get(edge.source)?.push(edge.target)
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true
    if (visited.has(nodeId)) return false
    visiting.add(nodeId)
    for (const target of adjacency.get(nodeId) ?? []) if (visit(target)) return true
    visiting.delete(nodeId)
    visited.add(nodeId)
    return false
  }
  return nodes.some((node) => visit(node.id))
}

export const pipelinePresenceAtom: ValidationAtom = {
  id: 'pipeline-presence',
  label: 'Pipeline presence',
  run({ nodes }) {
    return nodes.length === 0
      ? [issue(this.id, {
          id: 'empty-pipeline',
          severity: 'error',
          title: 'Pipeline is empty',
          detail: 'Add at least one Data Source card before running the agent flow.',
        })]
      : []
  },
}

export const edgeIntegrityAtom: ValidationAtom = {
  id: 'edge-integrity',
  label: 'Edge integrity',
  run({ nodes, edges }) {
    const nodeIds = new Set(nodes.map((node) => node.id))
    return edges.flatMap((edge) => {
      const findings: ValidationIssue[] = []
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) findings.push(issue(this.id, { id: `dangling-${edge.id}`, severity: 'error', title: 'Dangling connection', detail: `${edge.source} → ${edge.target} references a missing card.` }))
      if (edge.source === edge.target) findings.push(issue(this.id, { id: `self-${edge.id}`, severity: 'error', nodeId: edge.source, title: 'Invalid direction', detail: 'A card cannot send data to itself.' }))
      return findings
    })
  },
}

export const acyclicLineageAtom: ValidationAtom = {
  id: 'acyclic-lineage',
  label: 'Acyclic lineage',
  run(context) {
    return containsCycle(context) ? [issue(this.id, { id: 'cycle', severity: 'error', title: 'Circular lineage', detail: 'The pipeline contains a cycle, so lineage direction is ambiguous.' })] : []
  },
}

type CardContract = (context: ValidationContext, nodeId: string) => ValidationIssue[]

const cardContracts: Partial<Record<CardKind, CardContract>> = {
  source: ({ edges }, nodeId) => edges.some((edge) => edge.target === nodeId) ? [issue('card-contracts', { id: `source-input-${nodeId}`, severity: 'error', nodeId, title: 'Source has an input', detail: 'Data Source cards must begin a lineage path.' })] : [],
  split: ({ edges }, nodeId) => edges.filter((edge) => edge.source === nodeId).length < 2 ? [issue('card-contracts', { id: `split-branches-${nodeId}`, severity: 'warning', nodeId, title: 'Incomplete split', detail: 'A Split should expose at least two branches.' })] : [],
  review: ({ edges }, nodeId) => edges.some((edge) => edge.target === nodeId) && edges.some((edge) => edge.source === nodeId) ? [] : [issue('card-contracts', { id: `review-path-${nodeId}`, severity: 'warning', nodeId, title: 'Review is not gating a path', detail: 'A Human Review card must have an input and an output.' })],
  output: ({ edges }, nodeId) => edges.some((edge) => edge.source === nodeId) ? [issue('card-contracts', { id: `output-edge-${nodeId}`, severity: 'error', nodeId, title: 'Output has a downstream edge', detail: 'Output cards must end a lineage path.' })] : [],
}

export const cardContractsAtom: ValidationAtom = {
  id: 'card-contracts',
  label: 'Atomic card contracts',
  run(context) {
    return context.nodes.flatMap((node) => {
      const findings: ValidationIssue[] = []
      if (node.data.kind !== 'source' && !context.edges.some((edge) => edge.target === node.id)) findings.push(issue(this.id, { id: `orphan-${node.id}`, severity: 'warning', nodeId: node.id, title: 'Orphan card', detail: `${node.data.label} does not receive data.` }))
      return [...findings, ...(cardContracts[node.data.kind]?.(context, node.id) ?? [])]
    })
  },
}

export const sensitiveDataAtom: ValidationAtom = {
  id: 'sensitive-data-path',
  label: 'Sensitive data propagation',
  run({ nodes }) {
    const source = nodes.find((node) => node.data.schema.some((field) => field.tags?.includes('PII')))
    const activation = nodes.find((node) => node.id === 'activation-output')
    const protectedPath = nodes.some((node) => ['transform', 'decision'].includes(node.data.kind) && /mask|hash|token/i.test(`${node.data.label} ${node.data.rule ?? ''}`))
    return source && activation && !protectedPath ? [issue(this.id, { id: 'pii-activation', severity: 'error', nodeId: activation.id, title: 'PII reaches activation unmasked', detail: 'DataHub classifies email as PII, but no masking transform exists on the activation path.' })] : []
  },
}

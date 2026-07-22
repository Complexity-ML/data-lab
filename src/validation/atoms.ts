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

export const pipelineTerminalsAtom: ValidationAtom = {
  id: 'pipeline-terminals',
  label: 'Required pipeline terminals',
  run({ nodes }) {
    if (nodes.length === 0) return []
    const findings: ValidationIssue[] = []
    if (!nodes.some((node) => node.data.kind === 'source')) findings.push(issue(this.id, { id: 'missing-source', severity: 'error', title: 'Data Source is required', detail: 'A runnable pipeline must start from at least one Data Source card.' }))
    if (!nodes.some((node) => node.data.kind === 'output')) findings.push(issue(this.id, { id: 'missing-output', severity: 'error', title: 'Terminal Output is required', detail: 'A runnable pipeline must end at least one branch with an Output card.' }))
    return findings
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
  split: ({ edges }, nodeId) => {
    const outgoing = edges.filter((edge) => edge.source === nodeId)
    const handles = outgoing.map((edge) => edge.sourceHandle)
    const findings: ValidationIssue[] = []
    if (outgoing.length !== 2) findings.push(issue('card-contracts', { id: `split-branch-count-${nodeId}`, severity: 'error', nodeId, title: 'Invalid split branch count', detail: 'A Split must expose exactly one approved branch and one quarantine branch.' }))
    for (const handle of ['approved', 'quarantine']) {
      const count = handles.filter((candidate) => candidate === handle).length
      if (count !== 1) findings.push(issue('card-contracts', { id: `split-handle-${handle}-${nodeId}`, severity: 'error', nodeId, title: `Invalid ${handle} split handle`, detail: `Expected exactly one ${handle} connection, found ${count}.` }))
    }
    for (const edge of outgoing) if (!['approved', 'quarantine'].includes(edge.sourceHandle ?? '')) findings.push(issue('card-contracts', { id: `split-handle-unknown-${edge.id}`, severity: 'error', nodeId, title: 'Unknown split handle', detail: `${edge.id} must use the approved or quarantine source handle.` }))
    return findings
  },
  review: ({ edges }, nodeId) => edges.some((edge) => edge.target === nodeId) && edges.some((edge) => edge.source === nodeId) ? [] : [issue('card-contracts', { id: `review-path-${nodeId}`, severity: 'warning', nodeId, title: 'Review is not gating a path', detail: 'A Human Review card must have an input and an output.' })],
  output: ({ edges }, nodeId) => edges.some((edge) => edge.source === nodeId) ? [issue('card-contracts', { id: `output-edge-${nodeId}`, severity: 'error', nodeId, title: 'Output has a downstream edge', detail: 'Output cards must end a lineage path.' })] : [],
}

export const cardContractsAtom: ValidationAtom = {
  id: 'card-contracts',
  label: 'Atomic card contracts',
  run(context) {
    return context.nodes.flatMap((node) => {
      const findings: ValidationIssue[] = []
      if (node.data.kind !== 'source' && !context.edges.some((edge) => edge.target === node.id)) findings.push(issue(this.id, { id: `orphan-input-${node.id}`, severity: 'error', nodeId: node.id, title: 'Orphan card', detail: `${node.data.label} does not receive data.` }))
      if (node.data.kind !== 'output' && !context.edges.some((edge) => edge.source === node.id)) findings.push(issue(this.id, { id: `orphan-output-${node.id}`, severity: 'error', nodeId: node.id, title: 'Dead-end card', detail: `${node.data.label} does not lead to another card or terminal output.` }))
      return [...findings, ...(cardContracts[node.data.kind]?.(context, node.id) ?? [])]
    })
  },
}

export const sensitiveDataAtom: ValidationAtom = {
  id: 'sensitive-data-path',
  label: 'Sensitive data propagation',
  run({ nodes, edges }) {
    const byId = new Map(nodes.map((node) => [node.id, node]))
    const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]))
    for (const edge of edges) outgoing.get(edge.source)?.push(edge.target)
    const sensitiveSources = nodes.filter((node) => node.data.kind === 'source' && (node.data.datahubTags?.some((tag) => /pii|sensitive|personal|gdpr/i.test(tag)) || node.data.schema.some((field) => field.tags?.some((tag) => /pii|sensitive|personal|gdpr/i.test(tag)))))
    const unsafeOutputs = new Map<string, string>()
    for (const source of sensitiveSources) {
      const queue = [{ id: source.id, protected: false }]
      const visited = new Set<string>()
      while (queue.length) {
        const current = queue.shift()!
        const node = byId.get(current.id)
        if (!node) continue
        const protectedPath = current.protected || (node.data.kind === 'transform' && /mask|hash|sha(?:-?\d+)?|tokeni[sz]e|redact|encrypt/i.test(`${node.data.label} ${node.data.rule ?? ''}`))
        const stateKey = `${node.id}:${protectedPath}`
        if (visited.has(stateKey)) continue
        visited.add(stateKey)
        const governedRestrictedSink = node.data.kind === 'output' && /quarantine|secure|vault|restricted|steward|hold/i.test(`${node.data.label} ${node.data.description} ${node.data.datahubUrn ?? ''}`)
        if (node.data.kind === 'output' && !protectedPath && !governedRestrictedSink) unsafeOutputs.set(node.id, source.id)
        for (const target of outgoing.get(node.id) ?? []) queue.push({ id: target, protected: protectedPath })
      }
    }
    return [...unsafeOutputs].map(([outputId, sourceId]) => issue(this.id, { id: `sensitive-unprotected-${sourceId}-${outputId}`, severity: 'error', nodeId: outputId, title: 'Sensitive data reaches an output unprotected', detail: `${byId.get(sourceId)?.data.label ?? sourceId} reaches ${byId.get(outputId)?.data.label ?? outputId} without a masking, hashing, tokenization, redaction or encryption transform on that path.` }))
  },
}

export const dataHubGovernanceAtom: ValidationAtom = {
  id: 'datahub-governance',
  label: 'DataHub governance signals',
  run({ nodes }) {
    return nodes.flatMap((node) => {
      if (!node.data.datahubUrn) return []
      const findings: ValidationIssue[] = []
      const sensitive = node.data.datahubTags?.some((tag) => /pii|sensitive|gdpr|personal/i.test(tag))
        || node.data.schema.some((field) => field.tags?.some((tag) => /pii|sensitive|gdpr|personal/i.test(tag)))
      if (!node.data.owner.trim() || node.data.owner === 'Unassigned') findings.push(issue(this.id, { id: `missing-owner-${node.id}`, severity: 'error', nodeId: node.id, title: 'DataHub ownership is missing', detail: 'Publishing is blocked because the bound asset has no accountable owner.' }))
      if (node.data.datahubQuality === 'failing') findings.push(issue(this.id, { id: `quality-failing-${node.id}`, severity: 'error', nodeId: node.id, title: 'DataHub quality checks are failing', detail: 'Publishing is blocked until failing DataHub assertions are resolved or explicitly reviewed.' }))
      if (node.data.datahubQuality === 'unavailable') findings.push(issue(this.id, { id: `quality-unavailable-${node.id}`, severity: 'warning', nodeId: node.id, title: 'Data quality metadata is unavailable', detail: 'Unavailable quality metadata is not treated as a healthy signal.' }))
      if (node.data.datahubFreshness?.stale) findings.push(issue(this.id, { id: `metadata-stale-${node.id}`, severity: sensitive ? 'error' : 'warning', nodeId: node.id, title: 'DataHub evidence is stale', detail: sensitive ? 'Sensitive-data evidence expired, so the agent cannot proceed until MCP context is refreshed.' : 'Refresh DataHub context before relying on this metadata.' }))
      return findings
    })
  },
}

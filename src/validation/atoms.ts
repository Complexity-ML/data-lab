import type { CardKind, PipelineNode } from '../domain/pipeline'
import type { ValidationAtom, ValidationContext, ValidationIssue } from './types'

function issue(atomId: string, value: Omit<ValidationIssue, 'atomId'>): ValidationIssue {
  return { atomId, ...value }
}

function containsCycle({ nodes, edges }: ValidationContext): boolean {
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]))
  for (const edge of edges) if (edge.sourceHandle !== 'feedback') adjacency.get(edge.source)?.push(edge.target)
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
    const byId = new Map(nodes.map((node) => [node.id, node]))
    return edges.flatMap((edge) => {
      const findings: ValidationIssue[] = []
      if (!byId.has(edge.source) || !byId.has(edge.target)) findings.push(issue(this.id, { id: `dangling-${edge.id}`, severity: 'error', title: 'Dangling connection', detail: `${edge.source} → ${edge.target} references a missing card.` }))
      if (edge.source === edge.target) findings.push(issue(this.id, { id: `self-${edge.id}`, severity: 'error', nodeId: edge.source, title: 'Invalid direction', detail: 'A card cannot send data to itself.' }))
      if (edge.sourceHandle === 'feedback' && (byId.get(edge.source)?.data.kind !== 'output' || byId.get(edge.target)?.data.kind !== 'monitor')) findings.push(issue(this.id, {
        id: `feedback-contract-${edge.id}`,
        severity: 'error',
        nodeId: edge.target,
        title: 'Invalid feedback boundary',
        detail: 'A feedback edge must connect an Output to a Live Monitor and represents a new atomic iteration.',
      }))
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

function hasUpstreamContextReader({ nodes, edges }: ValidationContext, nodeId: string): boolean {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const incoming = new Map(nodes.map((node) => [node.id, [] as string[]]))
  for (const edge of edges) if (edge.sourceHandle !== 'feedback') incoming.get(edge.target)?.push(edge.source)
  const queue = [...(incoming.get(nodeId) ?? [])]
  const visited = new Set<string>()
  while (queue.length) {
    const currentId = queue.shift()!
    if (visited.has(currentId)) continue
    visited.add(currentId)
    const current = byId.get(currentId)
    if (!current) continue
    if (['profile', 'analysis', 'impact'].includes(current.data.kind)) return true
    queue.push(...(incoming.get(currentId) ?? []))
  }
  return false
}

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
  patch: (context, nodeId) => {
    const node = context.nodes.find((candidate) => candidate.id === nodeId)
    if (!node) return []
    const findings: ValidationIssue[] = []
    if (node.data.patchScope !== 'graph-only') findings.push(issue('card-contracts', {
      id: `patch-scope-${nodeId}`,
      severity: 'error',
      nodeId,
      title: 'Patch scope is unsafe',
      detail: 'A Compatibility Patch must be graph-only and must never mutate the source DataHub dataset.',
    }))
    if (!/^graph[_ -]?only\s*:/i.test(node.data.rule?.trim() ?? '')) findings.push(issue('card-contracts', {
      id: `patch-rule-${nodeId}`,
      severity: 'error',
      nodeId,
      title: 'Patch rule is not explicit',
      detail: 'Declare a deterministic rule beginning with “graph_only:” so the compatibility overlay is replayable and reversible.',
    }))
    if (!hasUpstreamContextReader(context, nodeId)) findings.push(issue('card-contracts', {
      id: `patch-evidence-${nodeId}`,
      severity: 'warning',
      nodeId,
      title: 'Patch lacks upstream context evidence',
      detail: 'Place Data Profile, Data Analysis or Impact Analysis upstream so the patch is based on a complete versioned metadata reading.',
    }))
    return findings
  },
  monitor: ({ nodes, edges }, nodeId) => {
    const node = nodes.find((candidate) => candidate.id === nodeId)
    if (!node) return []
    const findings: ValidationIssue[] = []
    if (node.data.monitorMode !== 'event-loop') findings.push(issue('card-contracts', {
      id: `monitor-mode-${nodeId}`,
      severity: 'error',
      nodeId,
      title: 'Monitor mode is unsafe',
      detail: 'Live Monitor must open a new bounded iteration instead of creating an in-run cycle.',
    }))
    if (!/on_change\(metadata_fingerprint\)/i.test(node.data.rule ?? '')
      || !/cooldown=\d+s/i.test(node.data.rule ?? '')
      || !/max_iterations=\d+/i.test(node.data.rule ?? '')) findings.push(issue('card-contracts', {
      id: `monitor-policy-${nodeId}`,
      severity: 'error',
      nodeId,
      title: 'Monitor policy is incomplete',
      detail: 'Declare metadata fingerprint, cooldown and max_iterations so repeated agent runs remain bounded.',
    }))
    if (!edges.some((edge) => edge.source === nodeId && edge.sourceHandle !== 'feedback')) findings.push(issue('card-contracts', {
      id: `monitor-output-${nodeId}`,
      severity: 'error',
      nodeId,
      title: 'Monitor has no work branch',
      detail: 'Connect Live Monitor to the first card of the bounded iteration.',
    }))
    return findings
  },
  parallel: ({ nodes, edges }, nodeId) => {
    const node = nodes.find((candidate) => candidate.id === nodeId)
    if (!node) return []
    const outgoing = edges.filter((edge) => edge.source === nodeId && edge.sourceHandle !== 'feedback')
    const findings: ValidationIssue[] = []
    if (node.data.parallelMode !== 'branch-fanout') findings.push(issue('card-contracts', {
      id: `parallel-mode-${nodeId}`,
      severity: 'error',
      nodeId,
      title: 'Parallel agent mode is unsafe',
      detail: 'Parallel Agents must isolate each branch and merge only reviewed diffs.',
    }))
    if (outgoing.length < 2) findings.push(issue('card-contracts', {
      id: `parallel-branch-count-${nodeId}`,
      severity: 'error',
      nodeId,
      title: 'Parallel work needs independent branches',
      detail: 'Connect at least two downstream branches before launching parallel agents.',
    }))
    if (!/max_concurrency=\d+/i.test(node.data.rule ?? '')
      || !/context=branch_only/i.test(node.data.rule ?? '')
      || !/merge=atomic/i.test(node.data.rule ?? '')) findings.push(issue('card-contracts', {
      id: `parallel-policy-${nodeId}`,
      severity: 'error',
      nodeId,
      title: 'Parallel policy is incomplete',
      detail: 'Declare max_concurrency, branch-only context and atomic merge. Token usage is observed but not capped.',
    }))
    return findings
  },
  diagram: ({ nodes, edges }, nodeId) => {
    const node = nodes.find((candidate) => candidate.id === nodeId)
    if (!node) return []
    const incoming = edges.filter((edge) => edge.target === nodeId && edge.sourceHandle !== 'feedback')
    const findings: ValidationIssue[] = []
    if (node.data.diagramMode !== 'incident-workstream') findings.push(issue('card-contracts', {
      id: `diagram-mode-${nodeId}`,
      severity: 'error',
      nodeId,
      title: 'Incident Diagram mode is invalid',
      detail: 'Incident Diagram must relate branch results without mutating their evidence or source data.',
    }))
    if (incoming.length < 2) findings.push(issue('card-contracts', {
      id: `diagram-input-count-${nodeId}`,
      severity: 'warning',
      nodeId,
      title: 'Incident Diagram has fewer than two branches',
      detail: 'Connect parallel incident branches here to compare and merge their reviewed diffs.',
    }))
    if (!/group=incident/i.test(node.data.rule ?? '')
      || !/inputs=parallel_diffs/i.test(node.data.rule ?? '')
      || !/merge=atomic/i.test(node.data.rule ?? '')) findings.push(issue('card-contracts', {
      id: `diagram-policy-${nodeId}`,
      severity: 'error',
      nodeId,
      title: 'Incident Diagram merge policy is incomplete',
      detail: 'Declare incident grouping, parallel diff inputs and atomic merge.',
    }))
    return findings
  },
  review: ({ edges }, nodeId) => edges.some((edge) => edge.target === nodeId) && edges.some((edge) => edge.source === nodeId) ? [] : [issue('card-contracts', { id: `review-path-${nodeId}`, severity: 'warning', nodeId, title: 'Review is not gating a path', detail: 'A Human Review card must have an input and an output.' })],
  output: ({ nodes, edges }, nodeId) => edges.some((edge) => edge.source === nodeId && (edge.sourceHandle !== 'feedback' || nodes.find((candidate) => candidate.id === edge.target)?.data.kind !== 'monitor'))
    ? [issue('card-contracts', { id: `output-edge-${nodeId}`, severity: 'error', nodeId, title: 'Output has an invalid downstream edge', detail: 'Output may only emit a feedback edge to Live Monitor for the next atomic iteration.' })]
    : [],
}

export const cardContractsAtom: ValidationAtom = {
  id: 'card-contracts',
  label: 'Atomic card contracts',
  run(context) {
    return context.nodes.flatMap((node) => {
      if (node.data.kind === 'profile') return []
      const findings: ValidationIssue[] = []
      if (node.data.kind !== 'source' && node.data.kind !== 'monitor' && !context.edges.some((edge) => edge.target === node.id && edge.sourceHandle !== 'feedback')) findings.push(issue(this.id, { id: `orphan-input-${node.id}`, severity: 'error', nodeId: node.id, title: 'Orphan card', detail: `${node.data.label} does not receive data.` }))
      if (node.data.kind !== 'output' && !context.edges.some((edge) => edge.source === node.id && edge.sourceHandle !== 'feedback')) findings.push(issue(this.id, { id: `orphan-output-${node.id}`, severity: 'error', nodeId: node.id, title: 'Dead-end card', detail: `${node.data.label} does not lead to another card or terminal output.` }))
      return [...findings, ...(cardContracts[node.data.kind]?.(context, node.id) ?? [])]
    })
  },
}

export const schemaContractAtom: ValidationAtom = {
  id: 'schema-contract',
  label: 'Declared schema contracts',
  run({ nodes, edges }) {
    const byId = new Map(nodes.map((node) => [node.id, node]))
    const incoming = new Map(nodes.map((node) => [node.id, [] as string[]]))
    for (const edge of edges) if (edge.sourceHandle !== 'feedback') incoming.get(edge.target)?.push(edge.source)
    return nodes.flatMap((contract) => {
      if (contract.data.kind !== 'validation') return []
      const declaration = contract.data.rule?.match(/schema_contract\s*:\s*(.+)/i)?.[1]
      if (!declaration) return []
      const expected = declaration.split(',').flatMap((entry) => {
        const [name, type] = entry.trim().split(':').map((value) => value.trim())
        return name && ['string', 'number', 'boolean', 'timestamp'].includes(type) ? [{ name, type }] : []
      })
      const queue = [...(incoming.get(contract.id) ?? [])]
      const visited = new Set<string>()
      let upstream = undefined as PipelineNode | undefined
      while (queue.length && !upstream) {
        const id = queue.shift()!
        if (visited.has(id)) continue
        visited.add(id)
        const candidate = byId.get(id)
        if (!candidate) continue
        if (candidate.data.schema.length) upstream = candidate
        else queue.push(...(incoming.get(id) ?? []))
      }
      if (!upstream) return [issue(this.id, { id: `schema-contract-unavailable-${contract.id}`, severity: 'warning', nodeId: contract.id, title: 'Schema contract cannot be evaluated', detail: 'No upstream card exposes a schema for this declared contract.' })]
      return expected.flatMap((field) => {
        const actual = upstream!.data.schema.find((candidate) => candidate.name === field.name)
        if (!actual) return [issue(this.id, { id: `schema-contract-missing-${contract.id}-${field.name}`, severity: 'error', nodeId: contract.id, title: `Required field ${field.name} is missing`, detail: `${contract.data.label} expects ${field.name}:${field.type}, but ${upstream!.data.label} does not expose that field.` })]
        return actual.type !== field.type ? [issue(this.id, { id: `schema-contract-type-${contract.id}-${field.name}`, severity: 'error', nodeId: contract.id, title: `Breaking type drift on ${field.name}`, detail: `${contract.data.label} expects ${field.name}:${field.type}, but ${upstream!.data.label} exposes ${field.name}:${actual.type}.` })] : []
      })
    })
  },
}

export const sensitiveDataAtom: ValidationAtom = {
  id: 'sensitive-data-path',
  label: 'Sensitive data propagation',
  run({ nodes, edges }) {
    const byId = new Map(nodes.map((node) => [node.id, node]))
    const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]))
    for (const edge of edges) if (edge.sourceHandle !== 'feedback') outgoing.get(edge.source)?.push(edge.target)
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

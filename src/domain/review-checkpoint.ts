import type { Edge } from '@xyflow/react'
import type { AgentProposal, PipelineNode } from './pipeline'

function safeId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72) || 'proposal'
}

export function ensureHostReviewCheckpoint(
  proposal: AgentProposal,
  nodes: PipelineNode[],
  edges: Edge[],
  options: { anchorId?: string; reason: string },
) {
  proposal.requiresHumanReview = true
  if (!proposal.rationale.includes('Host risk gate:')) proposal.rationale = `${proposal.rationale}\n\nHost risk gate: ${options.reason}`.trim()

  const alreadyTouchesReview = proposal.addedNodes.some((node) => node.data.kind === 'review')
    || proposal.updatedNodes.some((update) => nodes.find((node) => node.id === update.nodeId)?.data.kind === 'review')
  if (alreadyTouchesReview) return

  const anchor = nodes.find((node) => node.id === options.anchorId)
    ?? proposal.addedNodes.find((node) => node.id === options.anchorId)
    ?? proposal.addedNodes.find((node) => node.data.kind !== 'control' && node.data.kind !== 'explorer')
    ?? nodes.find((node) => node.data.kind === 'monitor' || node.data.kind === 'source')
  const branchId = safeId(options.anchorId ?? anchor?.id ?? proposal.id)
  const existing = nodes.find((node) => node.data.kind === 'review' && node.data.rule?.includes(`branch_id=${branchId}`))
  if (existing) {
    proposal.updatedNodes.push({
      nodeId: existing.id,
      reason: options.reason,
      patch: {
        status: 'draft',
        runState: 'waiting',
        description: options.reason,
        rule: `checkpoint=host_risk_gate | branch_id=${branchId} | requires=explicit_approval`,
      },
    })
    return
  }

  const reviewId = `review-host-${branchId}`.slice(0, 118)
  const outputId = `output-host-${branchId}`.slice(0, 118)
  const occupied = new Set([...nodes, ...proposal.addedNodes].map((node) => node.id))
  if (occupied.has(reviewId)) return
  const x = (anchor?.position.x ?? 120) + 320
  const y = (anchor?.position.y ?? 120) + 180
  proposal.addedNodes.push({
    id: reviewId,
    type: 'pipeline',
    position: { x, y },
    data: {
      kind: 'review',
      label: 'Review host risk decision',
      description: options.reason,
      owner: 'Data Steward',
      status: 'draft',
      schema: [],
      rule: `checkpoint=host_risk_gate | branch_id=${branchId} | requires=explicit_approval`,
      agentAdded: true,
    },
  })
  proposal.addedNodes.push({
    id: outputId,
    type: 'pipeline',
    position: { x: x + 320, y },
    data: {
      kind: 'output',
      label: 'Reviewed branch outcome',
      description: 'Emits the branch result only after the host risk checkpoint is approved.',
      owner: 'DATA LAB Agent',
      status: 'draft',
      schema: [],
      rule: `emit=reviewed_branch | branch_id=${branchId}`,
      agentAdded: true,
    },
  })
  if (anchor) proposal.addedEdges.push({
    id: `edge-${branchId}-host-review`,
    source: anchor.id,
    target: reviewId,
    type: 'elastic',
  })
  proposal.addedEdges.push({
    id: `edge-${branchId}-host-output`,
    source: reviewId,
    target: outputId,
    type: 'elastic',
  })

  const duplicateEdgeIds = new Set<string>()
  proposal.addedEdges = proposal.addedEdges.filter((edge) => {
    const key = `${edge.source}:${edge.sourceHandle ?? ''}->${edge.target}:${edge.targetHandle ?? ''}`
    if (duplicateEdgeIds.has(key) || edges.some((current) => `${current.source}:${current.sourceHandle ?? ''}->${current.target}:${current.targetHandle ?? ''}` === key)) return false
    duplicateEdgeIds.add(key)
    return true
  })
}

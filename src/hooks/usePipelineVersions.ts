import type { Edge } from '@xyflow/react'
import { useState, type Dispatch, type SetStateAction } from 'react'
import { layoutPipeline } from '../domain/layout'
import { applyProposal, loadPipelinePreset, type AgentProposal, type PipelineNode, type PipelinePresetId } from '../domain/pipeline'
import { appendPipelineVersion, commitPendingVersion, createPipelineVersion, rejectPendingVersion, restorePipelineVersion, type PipelineVersion } from '../domain/versioning'
import { atomicTransactionBlockers, validatePipeline } from '../validation'
import { recordDiagnostic } from '../domain/diagnostics'
import { notifyToast } from '../domain/toasts'

type PipelineVersionsOptions = {
  edges: Edge[]
  nodes: PipelineNode[]
  proposal?: AgentProposal
  setActivity: (message: string) => void
  setEdges: Dispatch<SetStateAction<Edge[]>>
  setNodes: Dispatch<SetStateAction<PipelineNode[]>>
  setProjectTitle: Dispatch<SetStateAction<string>>
  setProposal: Dispatch<SetStateAction<AgentProposal | undefined>>
  setSelectedId: Dispatch<SetStateAction<string>>
  resolveApprovedExecution?(nodes: PipelineNode[], edges: Edge[]): PipelineNode[]
  resolveRejectedExecution?(nodes: PipelineNode[], edges: Edge[]): PipelineNode[]
}

export function usePipelineVersions({ edges, nodes, proposal, resolveApprovedExecution, resolveRejectedExecution, setActivity, setEdges, setNodes, setProjectTitle, setProposal, setSelectedId }: PipelineVersionsOptions) {
  const [versions, setVersions] = useState<PipelineVersion[]>([])
  const [pendingVersionId, setPendingVersionId] = useState<string>()

  const recordPendingReview = (nextProposal: AgentProposal) => {
    const preview = applyProposal(nodes, edges, nextProposal)
    const previewIssues = validatePipeline(preview.nodes, preview.edges)
    const version = createPipelineVersion(preview.nodes, preview.edges, `Review · ${nextProposal.title}`, 'agent', previewIssues)
    version.blockingIssues = atomicTransactionBlockers(previewIssues).length
    version.status = 'pending-review'
    version.description = `Upgrade: ${nextProposal.summary} Why: ${nextProposal.rationale} Incremental diff: +${nextProposal.addedNodes.length} cards, ~${nextProposal.updatedNodes.length} cards, +${nextProposal.addedEdges.length} edges, -${nextProposal.removedEdgeIds.length} edges.`
    version.evidence = nextProposal.evidence
    setPendingVersionId(version.id)
    setVersions((current) => appendPipelineVersion(current, version))
    return version.id
  }

  const approveProposal = () => {
    if (!proposal) {
      setActivity('Approval unavailable · the proposal is no longer pending · graph unchanged')
      recordDiagnostic({ category: 'revision', action: 'proposal.approve', status: 'warning', detail: { reason: 'proposal-missing' } })
      return false
    }
    const next = applyProposal(nodes, edges, proposal)
    const nextIssues = validatePipeline(next.nodes, next.edges)
    const blocking = atomicTransactionBlockers(nextIssues)
    if (blocking.length) {
      setActivity(`Transaction rejected · ${blocking.length} atomic check${blocking.length === 1 ? '' : 's'} failed · graph unchanged`)
      notifyToast(blocking[0]?.detail ?? 'The proposed graph failed an atomic safety check.', 'error', 'Change not applied')
      recordDiagnostic({
        category: 'revision',
        action: 'proposal.approve',
        status: 'error',
        detail: { blockerIds: blocking.map((issue) => issue.id), blockingIssues: blocking.length },
      })
      return false
    }
    const layouted = layoutPipeline(next.nodes, next.edges)
    const committedNodes = resolveApprovedExecution?.(layouted, next.edges) ?? layouted
    const version = createPipelineVersion(committedNodes, next.edges, proposal.title, 'agent', nextIssues)
    // A safe incremental graph transaction may still have pipeline-readiness
    // findings (for example, no Output card yet). Keep this field scoped to
    // atomic transaction blockers so committed revisions never claim that
    // their atomic validation failed.
    version.blockingIssues = blocking.length
    version.evidence = proposal.evidence
    setNodes(committedNodes)
    setEdges(next.edges)
    setVersions((current) => commitPendingVersion(current, pendingVersionId, version))
    setSelectedId(proposal.updatedNodes[0]?.nodeId ?? proposal.addedNodes[0]?.id ?? '')
    setProposal(undefined)
    setPendingVersionId(undefined)
    const readinessErrors = nextIssues.filter((issue) => issue.severity === 'error').length - blocking.length
    setActivity(readinessErrors > 0
      ? `Change approved · atomic transaction passed · ${readinessErrors} pipeline readiness check${readinessErrors === 1 ? '' : 's'} remain`
      : 'Change approved · atomic checks passed · revision committed')
    notifyToast(`${committedNodes.length} card${committedNodes.length === 1 ? '' : 's'} and ${next.edges.length} connection${next.edges.length === 1 ? '' : 's'} committed to the active graph.`, 'success', 'Graph updated')
    recordDiagnostic({ category: 'revision', action: 'proposal.approve', status: 'success', detail: { versionId: version.id, blockingIssues: 0 } })
    return true
  }

  const rejectProposal = () => {
    if (pendingVersionId) setVersions((current) => rejectPendingVersion(current, pendingVersionId))
    if (resolveRejectedExecution) setNodes((current) => resolveRejectedExecution(current, edges))
    setPendingVersionId(undefined)
    setProposal(undefined)
    setActivity('Agent proposal rejected · revision marked rejected · active branch unchanged')
    recordDiagnostic({ category: 'revision', action: 'proposal.reject', status: 'info', detail: { versionId: pendingVersionId } })
  }

  const approvePendingVersion = (versionId: string) => {
    const version = versions.find((candidate) => candidate.id === versionId && candidate.status === 'pending-review')
    if (!version) { setActivity('Review is no longer pending · no graph change applied'); return false }
    const versionIssues = validatePipeline(version.nodes, version.edges)
    const blocking = atomicTransactionBlockers(versionIssues)
    if (blocking.length > 0) { setActivity(`Review cannot be approved · ${blocking.length} atomic check${blocking.length === 1 ? '' : 's'} failed`); return false }
    const layouted = layoutPipeline(version.nodes, version.edges)
    const committedNodes = resolveApprovedExecution?.(layouted, version.edges) ?? layouted
    setNodes(committedNodes)
    setEdges(version.edges)
    setVersions((current) => current.map((candidate) => candidate.id === versionId ? { ...candidate, nodes: committedNodes, blockingIssues: 0, status: 'committed' as const } : candidate))
    if (pendingVersionId === versionId) { setPendingVersionId(undefined); setProposal(undefined) }
    setSelectedId(committedNodes[0]?.id ?? '')
    const readinessErrors = versionIssues.filter((issue) => issue.severity === 'error').length - blocking.length
    setActivity(readinessErrors > 0
      ? `Human Review approved · ${version.label} committed · ${readinessErrors} pipeline readiness check${readinessErrors === 1 ? '' : 's'} remain`
      : `Human Review approved · ${version.label} committed atomically`)
    return true
  }

  const rejectPendingVersionById = (versionId: string) => {
    const version = versions.find((candidate) => candidate.id === versionId && candidate.status === 'pending-review')
    if (!version) { setActivity('Review is no longer pending'); return false }
    setVersions((current) => rejectPendingVersion(current, versionId))
    if (resolveRejectedExecution) setNodes((current) => resolveRejectedExecution(current, edges))
    if (pendingVersionId === versionId) { setPendingVersionId(undefined); setProposal(undefined) }
    setActivity(`Human Review rejected · ${version.label} remains visible in history · active graph unchanged`)
    return true
  }

  const saveManualVersion = () => {
    const currentIssues = validatePipeline(nodes, edges)
    const blocking = currentIssues.filter((issue) => issue.severity === 'error')
    if (blocking.length) {
      setActivity(`Version not saved · fix ${blocking.length} blocking atomic check${blocking.length === 1 ? '' : 's'} first`)
      return
    }
    const version = createPipelineVersion(nodes, edges, `Manual checkpoint ${versions.length + 1}`, 'manual', currentIssues)
    setVersions((current) => appendPipelineVersion(current, version))
    setActivity(`Version saved · ${version.label}`)
    recordDiagnostic({ category: 'revision', action: 'checkpoint.save', status: 'success', detail: { versionId: version.id, label: version.label } })
  }

  const restoreVersion = (versionId: string) => {
    const version = versions.find((candidate) => candidate.id === versionId)
    if (!version || (version.status ?? 'committed') !== 'committed') return
    const restored = restorePipelineVersion(version)
    setNodes(restored.nodes)
    setEdges(restored.edges)
    setProposal(undefined)
    setPendingVersionId(undefined)
    setSelectedId(restored.nodes[0]?.id ?? '')
    setActivity(`Version restored · ${version.label}`)
  }

  const loadPreset = (presetId: PipelinePresetId) => {
    const preset = loadPipelinePreset(presetId)
    setNodes(preset.nodes)
    setEdges(preset.edges)
    setProjectTitle(preset.title)
    setSelectedId(preset.nodes[0]?.id ?? '')
    setProposal(undefined)
    setPendingVersionId(undefined)
    setActivity(presetId === 'empty' ? 'Empty workspace ready' : `${preset.title} example loaded · ${preset.nodes.length} cards · not saved`)
  }

  return { approvePendingVersion, approveProposal, loadPreset, pendingVersionId, recordPendingReview, rejectPendingVersionById, rejectProposal, restoreVersion, saveManualVersion, setVersions, versions }
}

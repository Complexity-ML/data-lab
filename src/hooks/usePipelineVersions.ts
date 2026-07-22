import type { Edge } from '@xyflow/react'
import { useState, type Dispatch, type SetStateAction } from 'react'
import { layoutPipeline } from '../domain/layout'
import { applyProposal, loadPipelinePreset, type AgentProposal, type PipelineNode, type PipelinePresetId } from '../domain/pipeline'
import { appendPipelineVersion, commitPendingVersion, createPipelineVersion, rejectPendingVersion, restorePipelineVersion, type PipelineVersion } from '../domain/versioning'
import { validatePipeline } from '../validation'

type PipelineVersionsOptions = {
  edges: Edge[]
  nodes: PipelineNode[]
  projectTitle: string
  proposal?: AgentProposal
  setActivity: (message: string) => void
  setEdges: Dispatch<SetStateAction<Edge[]>>
  setNodes: Dispatch<SetStateAction<PipelineNode[]>>
  setProjectTitle: Dispatch<SetStateAction<string>>
  setProposal: Dispatch<SetStateAction<AgentProposal | undefined>>
  setSelectedId: Dispatch<SetStateAction<string>>
}

export function usePipelineVersions({ edges, nodes, projectTitle, proposal, setActivity, setEdges, setNodes, setProjectTitle, setProposal, setSelectedId }: PipelineVersionsOptions) {
  const [versions, setVersions] = useState<PipelineVersion[]>([])
  const [pendingVersionId, setPendingVersionId] = useState<string>()

  const persist = (nextVersions: PipelineVersion[], nextNodes = nodes, nextEdges = edges) => {
    if (window.dataLab) void window.dataLab.saveWorkspace({ projectTitle, nodes: nextNodes, edges: nextEdges, versions: nextVersions })
  }

  const recordPendingReview = (nextProposal: AgentProposal) => {
    const preview = applyProposal(nodes, edges, nextProposal)
    const previewIssues = validatePipeline(preview.nodes, preview.edges)
    const version = createPipelineVersion(preview.nodes, preview.edges, `Review · ${nextProposal.title}`, 'agent', previewIssues)
    version.status = 'pending-review'
    version.description = `Upgrade: ${nextProposal.summary} Why: ${nextProposal.rationale}`
    version.evidence = nextProposal.evidence
    setPendingVersionId(version.id)
    setVersions((current) => {
      const nextVersions = appendPipelineVersion(current, version)
      persist(nextVersions)
      return nextVersions
    })
    return version.id
  }

  const approveProposal = () => {
    if (!proposal) return false
    const next = applyProposal(nodes, edges, proposal)
    const nextIssues = validatePipeline(next.nodes, next.edges)
    const blocking = nextIssues.filter((issue) => issue.severity === 'error')
    if (blocking.length) {
      setActivity(`Transaction rejected · ${blocking.length} atomic check${blocking.length === 1 ? '' : 's'} failed · graph unchanged`)
      return false
    }
    const layouted = layoutPipeline(next.nodes, next.edges)
    const version = createPipelineVersion(layouted, next.edges, proposal.title, 'agent', nextIssues)
    version.evidence = proposal.evidence
    setNodes(layouted)
    setEdges(next.edges)
    setVersions((current) => {
      const nextVersions = commitPendingVersion(current, pendingVersionId, version)
      persist(nextVersions, layouted, next.edges)
      return nextVersions
    })
    setSelectedId(proposal.updatedNodes[0]?.nodeId ?? proposal.addedNodes[0]?.id ?? '')
    setProposal(undefined)
    setPendingVersionId(undefined)
    setActivity('Change approved · atomic checks passed · revision committed')
    return true
  }

  const rejectProposal = () => {
    if (pendingVersionId) setVersions((current) => {
      const nextVersions = rejectPendingVersion(current, pendingVersionId)
      persist(nextVersions)
      return nextVersions
    })
    setPendingVersionId(undefined)
    setProposal(undefined)
    setActivity('Agent proposal rejected · revision marked rejected · active branch unchanged')
  }

  const saveManualVersion = () => {
    const currentIssues = validatePipeline(nodes, edges)
    const blocking = currentIssues.filter((issue) => issue.severity === 'error')
    if (blocking.length) {
      setActivity(`Version not saved · fix ${blocking.length} blocking atomic check${blocking.length === 1 ? '' : 's'} first`)
      return
    }
    const version = createPipelineVersion(nodes, edges, `Manual checkpoint ${versions.length + 1}`, 'manual', currentIssues)
    setVersions((current) => {
      const nextVersions = appendPipelineVersion(current, version)
      persist(nextVersions)
      return nextVersions
    })
    setActivity(`Version saved · ${version.label}`)
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
    persist(versions, restored.nodes, restored.edges)
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

  return { approveProposal, loadPreset, pendingVersionId, recordPendingReview, rejectProposal, restoreVersion, saveManualVersion, setVersions, versions }
}

import type { Edge } from '@xyflow/react'
import type { PipelineNode } from '../domain/pipeline'
import { acyclicLineageAtom, cardContractsAtom, dataHubGovernanceAtom, edgeIntegrityAtom, pipelinePresenceAtom, pipelineTerminalsAtom, schemaContractAtom, sensitiveDataAtom } from './atoms'
import type { ValidationAtom, ValidationIssue } from './types'

export const validationAtoms: ValidationAtom[] = [
  pipelinePresenceAtom,
  pipelineTerminalsAtom,
  edgeIntegrityAtom,
  acyclicLineageAtom,
  cardContractsAtom,
  schemaContractAtom,
  sensitiveDataAtom,
  dataHubGovernanceAtom,
]

export function validatePipeline(nodes: PipelineNode[], edges: Edge[]): ValidationIssue[] {
  const context = { nodes, edges }
  return validationAtoms.flatMap((atom) => atom.run(context))
}

/**
 * A reviewed diff may intentionally build a pipeline in small, replayable steps.
 * Missing terminals and temporarily orphaned cards keep the pipeline non-runnable,
 * but they must not prevent a safe graph transaction from being committed.
 */
export function atomicTransactionBlockers(issues: ValidationIssue[]): ValidationIssue[] {
  return issues.filter((issue) => {
    if (issue.severity !== 'error') return false
    if (issue.atomId === 'pipeline-presence' || issue.atomId === 'pipeline-terminals') return false
    if (issue.atomId === 'card-contracts' && /^orphan-(?:input|output)-/.test(issue.id)) return false
    return true
  })
}

export type { ValidationAtom, ValidationIssue } from './types'

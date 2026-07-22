import type { Edge } from '@xyflow/react'
import type { PipelineNode } from '../domain/pipeline'
import { acyclicLineageAtom, cardContractsAtom, dataHubGovernanceAtom, edgeIntegrityAtom, pipelinePresenceAtom, pipelineTerminalsAtom, sensitiveDataAtom } from './atoms'
import type { ValidationAtom, ValidationIssue } from './types'

export const validationAtoms: ValidationAtom[] = [
  pipelinePresenceAtom,
  pipelineTerminalsAtom,
  edgeIntegrityAtom,
  acyclicLineageAtom,
  cardContractsAtom,
  sensitiveDataAtom,
  dataHubGovernanceAtom,
]

export function validatePipeline(nodes: PipelineNode[], edges: Edge[]): ValidationIssue[] {
  const context = { nodes, edges }
  return validationAtoms.flatMap((atom) => atom.run(context))
}

export type { ValidationAtom, ValidationIssue } from './types'

import type { Edge } from '@xyflow/react'
import type { PipelineNode } from '../domain/pipeline'
import { acyclicLineageAtom, cardContractsAtom, edgeIntegrityAtom, sensitiveDataAtom } from './atoms'
import type { ValidationAtom, ValidationIssue } from './types'

export const validationAtoms: ValidationAtom[] = [
  edgeIntegrityAtom,
  acyclicLineageAtom,
  cardContractsAtom,
  sensitiveDataAtom,
]

export function validatePipeline(nodes: PipelineNode[], edges: Edge[]): ValidationIssue[] {
  const context = { nodes, edges }
  return validationAtoms.flatMap((atom) => atom.run(context))
}

export type { ValidationAtom, ValidationIssue } from './types'

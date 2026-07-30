import type { CardKind } from './pipeline'

export type ProductMode = 'incident-response' | 'advanced'

export const incidentResponseCardKinds: CardKind[] = [
  'source',
  'profile',
  'impact',
  'risk',
  'patch',
  'review',
  'validation',
  'monitor',
]

const allCardKinds: CardKind[] = [
  'control',
  'explorer',
  'worker',
  'query',
  'source',
  'profile',
  'analysis',
  'impact',
  'risk',
  'patch',
  'monitor',
  'parallel',
  'diagram',
  'split',
  'decision',
  'transform',
  'review',
  'validation',
  'output',
]

const primaryKinds = new Set<CardKind>(incidentResponseCardKinds)
export const advancedCardKinds = allCardKinds.filter((kind) => !primaryKinds.has(kind))

export function visibleCardKinds(mode: ProductMode): CardKind[] {
  return mode === 'incident-response' ? [...incidentResponseCardKinds] : [...allCardKinds]
}

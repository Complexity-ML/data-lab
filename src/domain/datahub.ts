import type { SchemaField } from './pipeline'
import type { CatalogAssetSummary, CatalogEvidence, LineageAssetSummary } from './catalog-connectors'

/** @deprecated Use CatalogEvidence in provider-neutral graph and version code. */
export interface DataHubEvidence extends CatalogEvidence {}

export interface DataHubAssetSummary extends Omit<CatalogAssetSummary, 'connectorId' | 'sourceSystem' | 'assetRef'> {
  connectorId?: string
  sourceSystem?: string
  assetRef?: string
  urn: string
  name: string
  platform: string
  environment: string
  description: string
  owners: string[]
  domain?: string
  tags: string[]
  fields: SchemaField[]
  qualityStatus: 'healthy' | 'failing' | 'unavailable'
  upstream: LineageAssetSummary[]
  downstream: LineageAssetSummary[]
  freshness: { capturedAt: string; expiresAt: string; stale: boolean }
}

import type { SchemaField } from './pipeline'

export type CatalogConnectorKind = 'mcp' | 'http-api'

export interface CatalogConnectorManifest {
  id: string
  name: string
  kind: CatalogConnectorKind
  url: string
  enabled: boolean
  contract: 'data-lab.catalog.v1'
  searchTool?: string
  inspectTool?: string
}

export interface CatalogConnectorSummary extends CatalogConnectorManifest {
  builtIn: boolean
  tokenConfigured: boolean
}

export interface CatalogAssetSummary {
  connectorId: string
  sourceSystem: string
  assetRef: string
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
  upstream: { urn: string; name: string; sensitive: boolean }[]
  downstream: { urn: string; name: string; sensitive: boolean }[]
  freshness: { capturedAt: string; expiresAt: string; stale: boolean }
}

export interface CatalogEvidence {
  connectorId: string
  sourceSystem: string
  tool: string
  assetRef: string
  urn: string
  capturedAt: string
  expiresAt: string
  status: 'ok' | 'unavailable' | 'error'
  summary: string
  cached: boolean
  stale: boolean
}

export interface CatalogInspection {
  asset: CatalogAssetSummary
  evidence: CatalogEvidence[]
}

export const catalogConnectorDefaults = {
  contract: 'data-lab.catalog.v1' as const,
  searchTool: 'catalog_search',
  inspectTool: 'catalog_inspect',
}

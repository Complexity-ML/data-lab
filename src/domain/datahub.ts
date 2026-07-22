import type { SchemaField } from './pipeline'

export interface DataHubEvidence {
  tool: string
  urn: string
  capturedAt: string
  expiresAt: string
  status: 'ok' | 'unavailable' | 'error'
  summary: string
  cached: boolean
  stale: boolean
}

export interface DataHubAssetSummary {
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

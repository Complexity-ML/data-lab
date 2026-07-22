export interface DataHubAssetSummary {
  urn: string
  name: string
  platform: string
  environment: string
  description: string
  owners: string[]
  domain?: string
  tags: string[]
  fields: { name: string; type: 'string' | 'number' | 'boolean' | 'timestamp'; tags?: string[] }[]
  qualityStatus: 'healthy' | 'failing' | 'unavailable'
  upstream: { urn: string; name: string; sensitive: boolean }[]
  downstream: { urn: string; name: string; sensitive: boolean }[]
  freshness: { capturedAt: string; expiresAt: string; stale: boolean }
}

type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function readStructuredToolResult(result: unknown): unknown {
  const value = record(result)
  if (value.structuredContent && typeof value.structuredContent === 'object') return value.structuredContent
  for (const item of array(value.content)) {
    const block = record(item)
    if (block.type !== 'text' || typeof block.text !== 'string') continue
    try { return JSON.parse(block.text) } catch { /* try the next text block */ }
  }
  return {}
}

function datasetIdentity(urn: string) {
  const match = urn.match(/^urn:li:dataset:\(urn:li:dataPlatform:([^,]+),(.+),([^,]+)\)$/)
  const qualifiedName = match?.[2] ?? urn.split(',').at(-2) ?? urn
  return { platform: match?.[1] ?? 'unknown', environment: match?.[3] ?? 'unknown', name: qualifiedName.split('.').at(-1) ?? qualifiedName }
}

export function parseSearchResults(payload: unknown): { urn: string; name: string }[] {
  const results = array(record(payload).searchResults)
  const seen = new Set<string>()
  return results.flatMap((item) => {
    const entity = record(record(item).entity)
    const urn = typeof entity.urn === 'string' ? entity.urn : ''
    if (!urn.startsWith('urn:li:dataset:') || seen.has(urn)) return []
    seen.add(urn)
    const properties = record(entity.properties)
    return [{ urn, name: typeof properties.name === 'string' ? properties.name : datasetIdentity(urn).name }]
  }).slice(0, 20)
}

function normalizedType(value: unknown): 'string' | 'number' | 'boolean' | 'timestamp' {
  const type = typeof value === 'string' ? value.toLowerCase() : ''
  if (/int|number|decimal|float|double/.test(type)) return 'number'
  if (/bool/.test(type)) return 'boolean'
  if (/date|time/.test(type)) return 'timestamp'
  return 'string'
}

function names(values: unknown[], resolver: (value: JsonRecord) => unknown): string[] {
  return [...new Set(values.map((value) => resolver(record(value))).filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).map((value) => value.trim().slice(0, 160)))]
}

function findDatasetUrns(value: unknown, found = new Map<string, boolean>(), depth = 0): Map<string, boolean> {
  if (depth > 12 || !value || typeof value !== 'object') return found
  if (Array.isArray(value)) {
    for (const item of value) findDatasetUrns(item, found, depth + 1)
    return found
  }
  const current = value as JsonRecord
  const sensitive = /pii|sensitive|personal|gdpr/i.test(JSON.stringify(current))
  for (const item of Object.values(current)) {
    if (typeof item === 'string' && item.startsWith('urn:li:dataset:')) found.set(item, Boolean(found.get(item)) || sensitive)
    else findDatasetUrns(item, found, depth + 1)
  }
  return found
}

function lineageAssets(payload: unknown, sourceUrn: string) {
  return [...findDatasetUrns(payload)].filter(([urn]) => urn !== sourceUrn).slice(0, 30).map(([urn, sensitive]) => ({ urn, name: datasetIdentity(urn).name, sensitive }))
}

export function parseAssetContext(options: { urn: string; name?: string; entityPayload?: unknown; schemaPayload?: unknown; upstreamPayload?: unknown; downstreamPayload?: unknown; capturedAt?: string; expiresAt?: string }): DataHubAssetSummary {
  const { urn } = options
  const identity = datasetIdentity(urn)
  const entityResult = array(record(options.entityPayload).result)
  const entity = record(entityResult.find((candidate) => record(candidate).urn === urn) ?? entityResult[0])
  const properties = record(entity.properties)
  const editableProperties = record(entity.editableProperties)
  const platform = record(entity.platform)
  const ownership = record(entity.ownership)
  const owners = names(array(ownership.owners), (entry) => {
    const owner = record(entry.owner)
    const ownerProperties = record(owner.properties)
    const ownerInfo = record(owner.info)
    return ownerProperties.displayName ?? ownerInfo.displayName ?? owner.name ?? owner.urn
  })
  const tagContainer = record(entity.tags)
  const tags = names(array(tagContainer.tags), (entry) => record(record(entry).tag).properties ? record(record(record(entry).tag).properties).name : record(record(entry).tag).urn)
  const termContainer = record(entity.glossaryTerms)
  const terms = names(array(termContainer.terms), (entry) => record(record(record(entry).term).properties).name)
  const domain = record(record(entity.domain).domain)
  const domainName = record(domain.properties).name
  const schema = record(options.schemaPayload)
  const fields = array(schema.fields).map((value) => {
    const field = record(value)
    const fieldTags = [...new Set([...array(field.editedTags), ...array(field.editedGlossaryTerms)].filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim())).map((entry) => entry.trim().slice(0, 160)))]
    return { name: typeof field.fieldPath === 'string' ? field.fieldPath.slice(0, 240) : '', type: normalizedType(field.nativeDataType), tags: fieldTags.length ? fieldTags : undefined }
  }).filter((field) => field.name).slice(0, 250)
  const serialized = JSON.stringify(entity)
  const capturedAt = options.capturedAt ?? new Date().toISOString()
  const expiresAt = options.expiresAt ?? new Date(Date.now() + 2 * 60_000).toISOString()

  return {
    urn,
    name: typeof entity.name === 'string' ? entity.name : typeof properties.name === 'string' ? properties.name : options.name ?? identity.name,
    platform: typeof platform.name === 'string' ? platform.name : identity.platform,
    environment: identity.environment,
    description: typeof editableProperties.description === 'string' ? editableProperties.description : typeof properties.description === 'string' ? properties.description : 'No description available in DataHub.',
    owners,
    domain: typeof domainName === 'string' ? domainName : undefined,
    tags: [...new Set([...tags, ...terms])],
    fields,
    qualityStatus: /"result"\s*:\s*"?(FAIL|ERROR)|failing|critical/i.test(serialized) ? 'failing' : /assertion|quality|health/i.test(serialized) ? 'healthy' : 'unavailable',
    upstream: lineageAssets(options.upstreamPayload, urn),
    downstream: lineageAssets(options.downstreamPayload, urn),
    freshness: { capturedAt, expiresAt, stale: new Date(expiresAt).getTime() <= Date.now() },
  }
}

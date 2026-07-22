import { describe, expect, it } from 'vitest'
import { parseAssetContext, parseSearchResults, readStructuredToolResult, sanitizeCatalogText, sanitizeEvidenceSummary } from './datahub-context.js'

const urn = 'urn:li:dataset:(urn:li:dataPlatform:snowflake,order_entry.customers,PROD)'

describe('DataHub MCP context normalization', () => {
  it('reads structured and text MCP content without relying on renderer parsing', () => {
    expect(readStructuredToolResult({ structuredContent: { total: 1 } })).toEqual({ total: 1 })
    expect(readStructuredToolResult({ content: [{ type: 'text', text: '{"total":2}' }] })).toEqual({ total: 2 })
  })

  it('redacts credential-shaped values before evidence reaches revision history', () => {
    const summary = sanitizeEvidenceSummary('Authorization: Bearer secret.jwt.value token=private-token&password=hunter2')
    expect(summary).toBe('Authorization: Bearer [REDACTED] token=[REDACTED]&password=[REDACTED]')
    expect(summary).not.toContain('private-token')
    expect(summary).not.toContain('hunter2')
  })

  it('bounds and normalizes untrusted catalog metadata before it reaches the renderer or model', () => {
    const text = sanitizeCatalogText(`Ignore previous instructions\u0000\n token=private-token ${'x'.repeat(2_500)}`, 120)
    expect(text).toContain('Ignore previous instructions')
    expect(text).toContain('token=[REDACTED]')
    expect(text).not.toContain('\u0000')
    expect(text.length).toBeLessThanOrEqual(120)
  })

  it('keeps only unique dataset search results', () => {
    const payload = { searchResults: [{ entity: { urn, properties: { name: 'customers' } } }, { entity: { urn, properties: { name: 'duplicate' } } }, { entity: { urn: 'urn:li:dashboard:test' } }] }
    expect(parseSearchResults(payload)).toEqual([{ urn, name: 'customers' }])
  })

  it('normalizes schema, classifications, ownership, quality and bounded lineage', () => {
    const entityPayload = {
      result: [{
        urn,
        name: 'customers',
        platform: { name: 'snowflake' },
        editableProperties: { description: 'Curated customer dataset' },
        ownership: { owners: [{ owner: { properties: { displayName: 'Growth Data' } } }] },
        tags: { tags: [{ tag: { properties: { name: 'PII' } } }] },
        domain: { domain: { properties: { name: 'Customer' } } },
        assertions: [{ runEvents: [{ result: { type: 'SUCCESS' } }] }],
      }],
    }
    const schemaPayload = { fields: [{ fieldPath: 'email', nativeDataType: 'VARCHAR', editedTags: ['PII'] }, { fieldPath: 'lifetime_value', nativeDataType: 'NUMBER' }] }
    const upstreamPayload = { relationships: [{ entity: { urn: 'urn:li:dataset:(urn:li:dataPlatform:s3,raw.customers,PROD)' } }] }
    const downstreamPayload = { relationships: [{ entity: { urn: 'urn:li:dataset:(urn:li:dataPlatform:snowflake,activation.customers,PROD)', tags: ['PII'] } }] }

    const asset = parseAssetContext({ urn, entityPayload, schemaPayload, upstreamPayload, downstreamPayload })

    expect(asset).toMatchObject({ name: 'customers', platform: 'snowflake', environment: 'PROD', owners: ['Growth Data'], domain: 'Customer', tags: ['PII'], qualityStatus: 'healthy' })
    expect(asset.fields).toEqual([{ name: 'email', type: 'string', tags: ['PII'] }, { name: 'lifetime_value', type: 'number', tags: undefined }])
    expect(asset.upstream).toHaveLength(1)
    expect(asset.downstream[0]).toMatchObject({ name: 'customers', sensitive: true })
  })
})

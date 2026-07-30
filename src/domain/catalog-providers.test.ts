import { describe, expect, it } from 'vitest'
import { catalogProviderOptions } from './catalog-providers'

describe('connector-neutral catalog positioning', () => {
  it('describes DataHub as one built-in adapter rather than the product core', () => {
    expect(catalogProviderOptions.find((provider) => provider.id === 'datahub')).toMatchObject({
      availability: 'built-in',
      name: 'DataHub',
    })
    expect(catalogProviderOptions.filter((provider) => provider.availability === 'built-in')).toHaveLength(1)
  })

  it('does not claim native integrations that are not implemented', () => {
    for (const id of ['openmetadata', 'dbt', 'snowflake']) {
      expect(catalogProviderOptions.find((provider) => provider.id === id)?.availability).not.toBe('built-in')
    }
    expect(catalogProviderOptions.some((provider) => provider.id === 'catalog-v1' && provider.availability === 'contract')).toBe(true)
  })
})

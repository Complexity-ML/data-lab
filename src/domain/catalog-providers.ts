export type CatalogProviderAvailability = 'built-in' | 'contract' | 'planned'

export interface CatalogProviderOption {
  id: 'datahub' | 'catalog-v1' | 'openmetadata' | 'dbt' | 'snowflake'
  name: string
  availability: CatalogProviderAvailability
  description: string
}

export const catalogProviderOptions: CatalogProviderOption[] = [
  {
    id: 'datahub',
    name: 'DataHub',
    availability: 'built-in',
    description: 'Built-in catalog adapter with schema, lineage, profiles and governed write-back.',
  },
  {
    id: 'catalog-v1',
    name: 'Catalog v1',
    availability: 'contract',
    description: 'Provider-neutral MCP or HTTP contract already supported by DATA LAB.',
  },
  {
    id: 'openmetadata',
    name: 'OpenMetadata',
    availability: 'planned',
    description: 'Native adapter is planned; connect today through a Catalog v1 adapter.',
  },
  {
    id: 'dbt',
    name: 'dbt manifest',
    availability: 'planned',
    description: 'Direct manifest ingestion is planned; connect today through a Catalog v1 adapter.',
  },
  {
    id: 'snowflake',
    name: 'Snowflake',
    availability: 'planned',
    description: 'Native account discovery is planned; connect today through a Catalog v1 adapter.',
  },
]

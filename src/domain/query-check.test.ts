import { describe, expect, it } from 'vitest'
import { defaultQueryCheckRule, parseQueryCheckRule, queryCheckRuleError } from './query-check'

describe('Query Check contract', () => {
  it('accepts a registered bounded metadata read', () => {
    expect(parseQueryCheckRule(defaultQueryCheckRule)).toMatchObject({
      complete: true,
      connector: 'datahub',
      protocol: 'graphql',
      operation: 'entity.read',
      mode: 'read_only',
      variables: 'host_validated',
      response: 'bounded_metadata',
    })
    expect(queryCheckRuleError(defaultQueryCheckRule)).toBeUndefined()
  })

  it('accepts a governed write only with every safety boundary', () => {
    const rule = 'connector=datahub | protocol=graphql | registry=connector_manifest | operation=metadata.update | mode=governed_write | variables=host_validated | timeout_ms=8000 | review=required | dry_run=required | rollback=versioned | response=mutation_receipt'
    expect(queryCheckRuleError(rule)).toBeUndefined()
  })

  it.each([
    ['arbitrary operation', defaultQueryCheckRule.replace('entity.read', 'graphql.execute'), 'Choose one registered operation'],
    ['raw variables', defaultQueryCheckRule.replace('host_validated', 'raw'), 'validated by the DATA LAB host'],
    ['unbounded timeout', defaultQueryCheckRule.replace('timeout_ms=8000', 'timeout_ms=60000'), 'between 1000 and 30000'],
    ['write without review', defaultQueryCheckRule.replace('entity.read', 'metadata.update'), 'mode=governed_write'],
    ['free introspection', `${defaultQueryCheckRule} | selection=__schema`, 'introspection'],
  ])('rejects %s', (_label, rule, message) => {
    expect(queryCheckRuleError(rule)).toContain(message)
  })
})

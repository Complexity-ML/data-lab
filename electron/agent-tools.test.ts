import { describe, expect, it } from 'vitest'
import { AgentToolSession, agentToolDefinitions } from './agent-tools.js'

const payload = {
  graph: {
    nodes: [
      { id: 'source-1', kind: 'source', label: 'Customers' },
      { id: 'split-1', kind: 'split', label: 'Risk route' },
      { id: 'output-1', kind: 'output', label: 'Published dataset' },
    ],
    edges: [{ id: 'edge-1', source: 'source-1', target: 'output-1' }],
  },
}

describe('bounded DATA LAB agent tools', () => {
  it('publishes strict schemas with every property required', () => {
    for (const tool of agentToolDefinitions) {
      expect(tool.strict).toBe(true)
      expect(tool.parameters.additionalProperties).toBe(false)
      expect(tool.parameters.required).toEqual(Object.keys(tool.parameters.properties))
    }
  })

  it('builds complete actions from small tool calls and finishes a valid review plan', () => {
    const session = new AgentToolSession(payload)
    expect(session.execute('add_card', {
      node_id: 'profile-1',
      kind: 'profile',
      label: 'Customer profile',
      description: null,
      owner: null,
      rule: 'schema=versioned',
      reason: 'Avoid repeated schema reconstruction.',
    }).ok).toBe(true)
    expect(session.execute('add_card', {
      node_id: 'review-1',
      kind: 'review',
      label: 'Verify profile evidence',
      description: null,
      owner: null,
      rule: null,
      reason: 'The evidence is stale.',
    }).ok).toBe(true)
    expect(session.execute('connect_cards', {
      source: 'source-1',
      target: 'profile-1',
      source_handle: null,
      reason: 'Profile the governed source.',
    }).ok).toBe(true)
    expect(session.execute('connect_cards', {
      source: 'profile-1',
      target: 'review-1',
      source_handle: null,
      reason: 'Pause this branch at a durable checkpoint.',
    }).ok).toBe(true)
    expect(session.execute('validate_plan', {}).ok).toBe(true)
    expect(session.execute('finish_plan', {
      title: 'Profile the governed source',
      summary: 'Add compact profile memory and a resumable review checkpoint.',
      rationale: 'The graph needs reusable evidence before transformation.',
      requires_human_review: true,
      confidence: 0.8,
      writeback: 'Commit locally after approval.',
      evidence: ['list_schema_fields · stale'],
    }).ok).toBe(true)

    expect(session.proposal?.actions[0]).toMatchObject({
      type: 'add_card',
      node_id: 'profile-1',
      description: 'Agent-proposed Data Profile awaiting graph review.',
      owner: 'DATA LAB Agent',
    })
    expect(session.proposal?.actions[1].rule).toContain('on_approve=resume_next_iteration')
    expect(session.trace.map((item) => item.tool)).toEqual([
      'add_card',
      'add_card',
      'connect_cards',
      'connect_cards',
      'validate_plan',
      'finish_plan',
    ])
  })

  it('rejects unsafe handles without losing earlier queued work', () => {
    const session = new AgentToolSession(payload)
    const rejected = session.execute('connect_cards', {
      source: 'source-1',
      target: 'output-1',
      source_handle: 'approved',
      reason: 'Invalid split routing.',
    })
    expect(rejected).toMatchObject({ ok: false, status: 'rejected' })

    expect(session.execute('connect_cards', {
      source: 'split-1',
      target: 'output-1',
      source_handle: 'approved',
      reason: 'Use the explicit approved branch.',
    }).ok).toBe(true)
    expect(session.execute('validate_plan', {})).toMatchObject({ ok: true, action_count: 1 })
  })

  it('exposes host-owned incident context without granting an incident mutation tool', () => {
    const session = new AgentToolSession({
      ...payload,
      incidentContext: [{ incidentKey: 'live-monitor:monitor-1:dataset', status: 'investigating', occurrenceCount: 2, fingerprint: 'abc123' }],
    })
    expect(session.execute('inspect_incident_context', { incident_key: 'live-monitor:monitor-1:dataset' })).toMatchObject({
      ok: true,
      incidents: [{ status: 'investigating', occurrenceCount: 2 }],
    })
    expect(agentToolDefinitions.map((tool) => tool.name)).not.toContain('record_incident')
  })

  it('requires a Human Review card before finishing a review-gated plan', () => {
    const session = new AgentToolSession(payload)
    const first = session.execute('finish_plan', {
      title: 'Unsafe change',
      summary: 'A sensitive change needs review.',
      rationale: 'PII is affected.',
      requires_human_review: true,
      confidence: 0.5,
      writeback: 'Do not commit yet.',
      evidence: ['PII tag'],
    })
    expect(first).toMatchObject({ ok: false, status: 'rejected' })
    expect(session.finished).toBe(false)

    session.execute('add_card', {
      node_id: 'review-sensitive-change',
      kind: 'review',
      label: 'Approve sensitive change',
      description: null,
      owner: 'Privacy',
      rule: null,
      reason: 'Explicit approval is required.',
    })
    expect(session.execute('finish_plan', {
      title: 'Safe checkpoint',
      summary: 'Pause the affected branch for review.',
      rationale: 'PII is affected.',
      requires_human_review: true,
      confidence: 0.5,
      writeback: 'Commit only after approval.',
      evidence: ['PII tag'],
    }).ok).toBe(true)
  })

  it('makes Human Review assistant turns physically read-only', () => {
    const session = new AgentToolSession({ ...payload, mode: 'review-assistant' })
    expect(session.execute('add_card', {
      node_id: 'forbidden-card',
      kind: 'analysis',
      label: 'Forbidden',
      description: null,
      owner: null,
      rule: null,
      reason: 'Attempt a mutation.',
    })).toMatchObject({ ok: false, status: 'rejected', summary: expect.stringContaining('read-only') })

    expect(session.execute('finish_plan', {
      title: 'Reviewer answer',
      summary: 'The evidence is incomplete.',
      rationale: 'A fresh schema read is required before approval.',
      requires_human_review: false,
      confidence: 0.9,
      writeback: 'No action; advice only.',
      evidence: ['Schema read timed out'],
    })).toMatchObject({ ok: true })
    expect(session.proposal?.actions).toEqual([])
  })
})

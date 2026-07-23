import { describe, expect, it } from 'vitest'
import { AgentToolSession } from './agent-tools.js'
import { chatGPTDynamicTools, dynamicToolCallResponse } from './chatgpt-session.js'

describe('ChatGPT Codex dynamic DATA LAB tools', () => {
  it('maps the shared strict tool surface to App Server dynamic tools', () => {
    expect(chatGPTDynamicTools.map((tool) => tool.name)).toContain('finish_plan')
    expect(chatGPTDynamicTools.find((tool) => tool.name === 'connect_cards')).toMatchObject({
      type: 'function',
      inputSchema: { type: 'object', additionalProperties: false },
    })
  })

  it('returns an App Server content item from the same bounded host session', () => {
    const session = new AgentToolSession({ graph: { nodes: [], edges: [] } })
    const response = dynamicToolCallResponse(session, {
      threadId: 'thread-1',
      tool: 'list_card_kinds',
      arguments: {},
    })
    expect(response.success).toBe(true)
    expect(response.contentItems[0]).toMatchObject({ type: 'inputText' })
    expect(JSON.parse(response.contentItems[0].text)).toMatchObject({ ok: true, status: 'read' })
  })
})

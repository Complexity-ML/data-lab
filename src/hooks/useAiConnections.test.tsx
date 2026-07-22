// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiStatus, ChatGPTSessionStatus } from '../domain/ai'
import { disconnectedAiStatus, useAiConnections } from './useAiConnections'

afterEach(() => { delete window.dataLab })

const connectedChatGPT: ChatGPTSessionStatus = { available: true, connected: true, selectedModel: 'gpt-5.6-sol' }

describe('active AI source recovery', () => {
  it('activates an already connected ChatGPT account when the saved API source is offline', async () => {
    const setActiveAiSource = vi.fn(async (source: 'chatgpt') => ({ source }))
    window.dataLab = {
      getAiStatus: vi.fn(async () => disconnectedAiStatus as AiStatus),
      getChatGPTStatus: vi.fn(async () => connectedChatGPT),
      getActiveAiSource: vi.fn(async () => ({ source: 'openai' as const })),
      setActiveAiSource,
    } as unknown as NonNullable<typeof window.dataLab>

    const { result } = renderHook(() => useAiConnections(vi.fn()))

    await waitFor(() => expect(result.current.activeAiSource).toBe('chatgpt'))
    expect(result.current.active.connected).toBe(true)
    expect(setActiveAiSource).toHaveBeenCalledWith('chatgpt')
  })

  it('selects ChatGPT immediately after a successful sign-in', async () => {
    const setActiveAiSource = vi.fn(async (source: 'chatgpt') => ({ source }))
    window.dataLab = {
      getAiStatus: vi.fn(async () => disconnectedAiStatus as AiStatus),
      getChatGPTStatus: vi.fn(async () => ({ available: true, connected: false })),
      getActiveAiSource: vi.fn(async () => ({ source: 'openai' as const })),
      connectChatGPT: vi.fn(async () => connectedChatGPT),
      setActiveAiSource,
    } as unknown as NonNullable<typeof window.dataLab>

    const { result } = renderHook(() => useAiConnections(vi.fn()))
    await act(() => result.current.connectChatGPT())
    await waitFor(() => expect(result.current.activeAiSource).toBe('chatgpt'))
    expect(setActiveAiSource).toHaveBeenCalledWith('chatgpt')
  })
})

import { useEffect, useMemo, useState } from 'react'
import type { ActiveAiSource, AiSettings, AiStatus, ChatGPTSessionStatus } from '../domain/ai'

export const disconnectedAiStatus: AiStatus = { connected: false, credentialSource: 'none', selectedProvider: 'openai', providers: {
  openai: { connected: false, credentialSource: 'none', model: 'gpt-5.6-terra', catalog: [], capabilities: { reasoning: true, verbosity: true, serviceTier: true, deprecated: false }, modelUnavailable: false },
  anthropic: { connected: false, credentialSource: 'none', model: 'claude-opus-4-8', catalog: [], capabilities: { reasoning: false, verbosity: false, serviceTier: false, deprecated: false }, modelUnavailable: false },
  moonshot: { connected: false, credentialSource: 'none', model: 'kimi-k3', catalog: [], capabilities: { reasoning: true, verbosity: false, serviceTier: false, deprecated: false }, modelUnavailable: false },
}, encryptionAvailable: false, settings: { provider: 'openai', model: 'gpt-5.6-terra', reasoningEffort: 'medium', verbosity: 'low', serviceTier: 'auto' } }

export const disconnectedChatGPTStatus: ChatGPTSessionStatus = { available: true, connected: false }

function sourceLabel(source: ActiveAiSource) {
  return source === 'chatgpt' ? 'ChatGPT' : source === 'anthropic' ? 'Claude' : source === 'moonshot' ? 'Kimi' : 'OpenAI'
}

export function useAiConnections(reportActivity: (message: string) => void) {
  const [aiStatus, setAiStatus] = useState<AiStatus>(disconnectedAiStatus)
  const [chatGPTStatus, setChatGPTStatus] = useState<ChatGPTSessionStatus>(disconnectedChatGPTStatus)
  const [activeAiSource, setActiveAiSource] = useState<ActiveAiSource>('openai')

  useEffect(() => {
    if (!window.dataLab) return
    void window.dataLab.getAiStatus().then(setAiStatus).catch(() => undefined)
    void window.dataLab.getChatGPTStatus().then(setChatGPTStatus).catch(() => undefined)
    void window.dataLab.getActiveAiSource().then(({ source }) => setActiveAiSource(source)).catch(() => undefined)
  }, [])

  const active = useMemo(() => ({
    connected: activeAiSource === 'chatgpt' ? chatGPTStatus.connected : aiStatus.providers[activeAiSource].connected,
    label: sourceLabel(activeAiSource),
    model: activeAiSource === 'chatgpt' ? chatGPTStatus.selectedModel ?? 'ChatGPT' : aiStatus.providers[activeAiSource].model,
  }), [activeAiSource, aiStatus, chatGPTStatus])

  const saveAiConnection = async (settings: Partial<AiSettings> & { apiKey?: string; clearKey?: boolean }) => {
    if (!window.dataLab) throw new Error('AI settings require the Electron application')
    const status = await window.dataLab.saveAiSettings(settings)
    setAiStatus(status)
    reportActivity(status.connected ? `${status.settings.model} connection settings saved` : 'AI settings saved · API key still required')
    return status
  }

  const testAiConnection = async () => {
    if (!window.dataLab) throw new Error('AI connection requires the Electron application')
    const status = await window.dataLab.testAiConnection()
    setAiStatus(status)
    reportActivity(`${sourceLabel(status.selectedProvider)} connected · ${status.settings.model} ready`)
  }

  const refreshAiModelCatalog = async (provider: AiSettings['provider']) => {
    if (!window.dataLab) throw new Error('Model discovery requires the Electron application')
    const status = await window.dataLab.refreshAiModelCatalog(provider)
    setAiStatus(status)
    reportActivity(`${sourceLabel(provider)} model catalog refreshed · ${status.providers[provider].catalog.length} models`)
    return status
  }

  const connectChatGPT = async () => {
    if (!window.dataLab) throw new Error('ChatGPT connection requires Electron')
    const status = await window.dataLab.connectChatGPT()
    setChatGPTStatus(status)
    reportActivity(status.connected ? `ChatGPT connected · ${status.selectedModel ?? 'default model'}` : 'ChatGPT sign-in was not completed')
  }

  const disconnectChatGPT = async () => {
    if (!window.dataLab) throw new Error('ChatGPT connection requires Electron')
    setChatGPTStatus(await window.dataLab.disconnectChatGPT())
    reportActivity('ChatGPT account disconnected from DATA LAB')
  }

  const configureChatGPT = async (configuration: { model: string; effort: string }) => {
    if (!window.dataLab) throw new Error('ChatGPT configuration requires Electron')
    setChatGPTStatus(await window.dataLab.configureChatGPT(configuration))
  }

  const selectActiveAgentSource = async (source: ActiveAiSource) => {
    if (!window.dataLab) throw new Error('Active agent selection requires the Electron application')
    const selected = await window.dataLab.setActiveAiSource(source)
    setActiveAiSource(selected.source)
    if (source !== 'chatgpt') setAiStatus(await window.dataLab.getAiStatus())
    reportActivity(`${sourceLabel(source)} selected as the active agent source`)
  }

  return {
    active,
    activeAiSource,
    aiStatus,
    chatGPTStatus,
    configureChatGPT,
    connectChatGPT,
    disconnectChatGPT,
    refreshAiModelCatalog,
    saveAiConnection,
    selectActiveAgentSource,
    testAiConnection,
  }
}

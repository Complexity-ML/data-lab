import type { SchemaField } from './domain/pipeline'
import type { ActiveAiSource, AiProposalResponse, AiSettings, AiStatus, ChatGPTSessionStatus } from './domain/ai'
import type { DataHubAssetSummary } from './domain/datahub'
import type { WorkspaceManagerState, WorkspacePayload, WorkspaceSummary } from './domain/workspace'
import type { DiagnosticBundle, DiagnosticInput } from './domain/diagnostics'
import type { AppUpdateChannel, AppUpdateStatus } from './domain/updates'

interface DataHubStatus {
  mode: 'demo' | 'connected'
  url?: string
  message: string
}

interface DataHubDatasetContext {
  urn: string
  name: string
  description?: string
  platform?: string
  owners: string[]
  tags: string[]
  fields: SchemaField[]
}

interface DataHubMcpStatus {
  mode: 'demo' | 'connected'
  transport: 'demo' | 'http' | 'stdio'
  message: string
  serverVersion?: string
  toolCount: number
  tools: string[]
  settings: {
    transport: 'http' | 'stdio'
    url: string
    tokenConfigured: boolean
    tokenSource: 'encrypted' | 'environment' | 'none'
    encryptionAvailable: boolean
    writebackEnabled: boolean
  }
}

interface DataHubMcpAudit {
  urn: string
  transport: 'http' | 'stdio'
  serverVersion?: string
  reads: {
    name: 'get_entities' | 'list_schema_fields' | 'get_lineage'
    status: 'ok' | 'unavailable' | 'error'
    summary: string
    capturedAt: string
    expiresAt: string
    cached: boolean
    stale: boolean
  }[]
}

declare global {
  interface Window {
    dataLab?: {
      runtime: 'electron'
      platform: 'darwin' | 'win32' | 'linux'
      getDataHubStatus(): Promise<DataHubStatus>
      loadDatasetContext(urn: string): Promise<DataHubDatasetContext>
      getDataHubMcpStatus(): Promise<DataHubMcpStatus>
      connectDataHubMcp(): Promise<DataHubMcpStatus>
      saveDataHubMcpSettings(payload: { transport: 'http' | 'stdio'; url: string; token?: string; clearToken?: boolean; writebackEnabled?: boolean }): Promise<DataHubMcpStatus>
      auditDataHubWithMcp(urn: string, force?: boolean): Promise<DataHubMcpAudit>
      searchDataHubAssets(query: string): Promise<DataHubAssetSummary[]>
      inspectDataHubAsset(urn: string, force?: boolean): Promise<{ asset: DataHubAssetSummary; evidence: DataHubMcpAudit['reads'] }>
      invalidateDataHubContext(urn?: string): Promise<{ invalidated: true }>
      writeDataHubDecision(payload: { revisionId: string; title: string; rationale: string; author: string; relatedAssets: string[] }): Promise<{ written: true; tool: 'save_document'; summary: string }>
      notifyHumanReview(payload: { cardLabel: string; reason: string; versionId?: string; remind?: boolean }): Promise<{ shown: boolean; deduplicated?: boolean }>
      getAiStatus(): Promise<AiStatus>
      saveAiSettings(payload: Partial<AiSettings> & { apiKey?: string; clearKey?: boolean }): Promise<AiStatus>
      testAiConnection(): Promise<AiStatus & { availableModels: string[] }>
      refreshAiModelCatalog(provider: import('./domain/ai').ApiProvider): Promise<AiStatus>
      runAiProposal(payload: unknown): Promise<AiProposalResponse>
      cancelAiProposal(): Promise<{ cancelled: boolean }>
      getChatGPTStatus(): Promise<ChatGPTSessionStatus>
      connectChatGPT(): Promise<ChatGPTSessionStatus>
      disconnectChatGPT(): Promise<ChatGPTSessionStatus>
      configureChatGPT(payload: { model: string; effort: string }): Promise<ChatGPTSessionStatus>
      runChatGPTProposal(payload: unknown): Promise<AiProposalResponse>
      cancelChatGPTProposal(): Promise<{ cancelled: boolean }>
      loadWorkspaceState(): Promise<WorkspaceManagerState>
      createWorkspace(name: string, workspace: WorkspacePayload): Promise<WorkspaceManagerState>
      renameWorkspace(workspaceId: string, name: string): Promise<WorkspaceSummary[]>
      duplicateWorkspace(workspaceId: string, name?: string): Promise<WorkspaceManagerState>
      archiveWorkspace(workspaceId: string): Promise<WorkspaceManagerState>
      openWorkspace(workspaceId: string): Promise<WorkspaceManagerState>
      autosaveWorkspace(workspace: WorkspacePayload): Promise<{ saved: true; workspaceId: string; updatedAt: string } | { saved: false; reason: 'no-active-workspace' }>
      commitWorkspace(workspace: WorkspacePayload): Promise<{ saved: true; workspaceId: string; updatedAt: string }>
      resolveWorkspaceRecovery(action: 'recover' | 'discard'): Promise<WorkspaceManagerState>
      getActiveAiSource(): Promise<{ source: ActiveAiSource }>
      setActiveAiSource(source: ActiveAiSource): Promise<{ source: ActiveAiSource }>
      recordDiagnostic(event: DiagnosticInput): Promise<DiagnosticInput & { id: string; timestamp: string }>
      exportDiagnostics(): Promise<DiagnosticBundle>
      openDiagnosticLogs(): Promise<{ opened: true; path: string }>
      restartApplication(): Promise<{ restarting: true }>
      getAppUpdateStatus(): Promise<AppUpdateStatus>
      setAppUpdateChannel(channel: AppUpdateChannel): Promise<AppUpdateStatus>
      checkForAppUpdate(): Promise<AppUpdateStatus>
      downloadAppUpdate(): Promise<AppUpdateStatus>
      installAppUpdate(): Promise<AppUpdateStatus>
      onAppUpdateStatusChanged(callback: (status: AppUpdateStatus) => void): () => void
      onHumanReviewOpened(callback: (payload: { versionId?: string }) => void): () => void
      getWindowState(): Promise<{ fullscreen: boolean }>
      onWindowStateChanged(callback: (state: { fullscreen: boolean }) => void): () => void
    }
  }
}

export {}

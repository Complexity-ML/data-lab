export type IncidentTransition = 'opened' | 'worsened' | 'agent-action' | 'human-review' | 'recovered'
export type IncidentSeverity = 'info' | 'warning' | 'critical'

export interface IncidentEventInput {
  incidentKey: string
  transition: IncidentTransition
  severity: IncidentSeverity
  title: string
  detail: string
  cardId?: string
  branchId?: string
  versionId?: string
}

export interface IncidentEvent extends IncidentEventInput {
  id: string
  workspaceId?: string
  createdAt: string
}

export interface IncidentRecordResult {
  recorded: boolean
  event?: IncidentEvent
}

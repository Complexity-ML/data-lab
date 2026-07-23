import type { DataHubAssetSummary, DataHubEvidence } from './datahub'
import type { AgentProposal, DataProfileSnapshot, PipelineNode, PipelineNodeData } from './pipeline'

const maximumProfiledFields = 32
const maximumAnomalies = 8

function boundedText(value: string, limit = 160) {
  return value.trim().slice(0, limit)
}

function estimateTokens(value: unknown) {
  return Math.max(1, Math.ceil(JSON.stringify(value).length / 4))
}

export function createDataProfileSnapshot(asset: DataHubAssetSummary): DataProfileSnapshot {
  const profiledFields = asset.fields.slice(0, maximumProfiledFields).map((field) => ({
    name: boundedText(field.name, 120),
    type: field.type,
    tags: field.tags?.map((tag) => boundedText(tag, 80)).filter(Boolean).slice(0, 8),
  }))
  const sensitiveFieldCount = asset.fields.filter((field) => field.tags?.some((tag) => /pii|sensitive|personal|gdpr/i.test(tag))).length
  const anomalies = [
    ...(!asset.fields.length ? ['Schema metadata is unavailable.'] : []),
    ...(!asset.owners.length ? ['No accountable owner is recorded.'] : []),
    ...(asset.qualityStatus === 'failing' ? ['DataHub quality checks are failing.'] : []),
    ...(asset.qualityStatus === 'unavailable' ? ['Quality metadata is unavailable.'] : []),
    ...(asset.freshness.stale ? ['The metadata snapshot is stale.'] : []),
    ...(sensitiveFieldCount ? [`${sensitiveFieldCount} sensitive field${sensitiveFieldCount === 1 ? '' : 's'} require governed handling.`] : []),
    ...(asset.fields.length > maximumProfiledFields ? [`${asset.fields.length - maximumProfiledFields} additional fields were omitted from compact agent memory.`] : []),
  ].slice(0, maximumAnomalies)
  const profileWithoutEstimate = {
    sourceUrn: boundedText(asset.urn, 2_000),
    capturedAt: asset.freshness.capturedAt,
    expiresAt: asset.freshness.expiresAt,
    stale: asset.freshness.stale,
    platform: boundedText(asset.platform),
    environment: boundedText(asset.environment, 80),
    quality: asset.qualityStatus,
    fieldCount: asset.fields.length,
    profiledFields,
    sensitiveFieldCount,
    upstreamCount: asset.upstream.length,
    downstreamCount: asset.downstream.length,
    anomalies,
  }
  return { ...profileWithoutEstimate, tokenEstimate: estimateTokens(profileWithoutEstimate) }
}

export function isDataProfileFresh(profile: DataProfileSnapshot, now = Date.now()) {
  const expiry = Date.parse(profile.expiresAt)
  return !profile.stale && Number.isFinite(expiry) && expiry > now
}

export function canReuseDataProfile(profile: DataProfileSnapshot, forcedMonitorAudit: boolean, now = Date.now()) {
  return !forcedMonitorAudit && isDataProfileFresh(profile, now)
}

export function summarizeDataProfile(profile: DataProfileSnapshot) {
  return `${profile.fieldCount} fields · ${profile.sensitiveFieldCount} sensitive · ${profile.quality} · ${profile.stale ? 'stale' : 'fresh'} · ${profile.upstreamCount} upstream · ${profile.downstreamCount} downstream · ~${profile.tokenEstimate} tokens`
}

export function dataProfileEvidence(profile: DataProfileSnapshot): { summaries: string[]; evidence: DataHubEvidence[] } {
  const summary = summarizeDataProfile(profile)
  return {
    summaries: [
      `Reused versioned Data Profile for ${profile.sourceUrn}: ${summary}.`,
      `Profiled schema: ${profile.profiledFields.map((field) => `${field.name}:${field.type}${field.tags?.length ? `[${field.tags.join(',')}]` : ''}`).join(', ') || 'unavailable'}`,
      `Profile anomalies: ${profile.anomalies.join(' ') || 'none'}`,
    ],
    evidence: [{ tool: 'data_profile_memory', urn: profile.sourceUrn, capturedAt: profile.capturedAt, expiresAt: profile.expiresAt, status: 'ok', summary, cached: true, stale: profile.stale }],
  }
}

function profilePatch(asset: DataHubAssetSummary): Partial<PipelineNodeData> {
  const profile = createDataProfileSnapshot(asset)
  return {
    label: `${asset.name} profile`,
    description: 'Bounded, versioned agent memory of schema, quality, freshness and anomalies. No raw rows are stored.',
    owner: 'DATA LAB Agent',
    status: profile.stale || profile.quality === 'failing' ? 'warning' : 'healthy',
    schema: [],
    rule: summarizeDataProfile(profile),
    profile,
    pinned: true,
    agentAdded: true,
  }
}

function profileId(urn: string) {
  let hash = 2166136261
  for (const character of urn) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  return `profile-${(hash >>> 0).toString(36)}`
}

export function addDataProfileToProposal(proposal: AgentProposal, currentNodes: PipelineNode[], asset: DataHubAssetSummary, sourceNode?: PipelineNode) {
  const patch = profilePatch(asset)
  const existing = currentNodes.find((node) => node.data.kind === 'profile' && node.data.profile?.sourceUrn === asset.urn)
  if (existing) {
    const redundant = proposal.addedNodes.find((node) => node.data.kind === 'profile' && (!node.data.profile || node.data.profile.sourceUrn === asset.urn))
    if (redundant) {
      proposal.addedNodes = proposal.addedNodes.filter((node) => node.id !== redundant.id)
      proposal.addedEdges = proposal.addedEdges.filter((edge) => edge.source !== redundant.id && edge.target !== redundant.id)
    }
    const update = proposal.updatedNodes.find((candidate) => candidate.nodeId === existing.id)
    if (update) update.patch = { ...update.patch, ...patch, kind: 'profile' }
    else proposal.updatedNodes.push({ nodeId: existing.id, patch: { ...patch, kind: 'profile' }, reason: 'Refresh compact profile memory after a trusted DataHub read.' })
    return existing.id
  }

  const proposed = proposal.addedNodes.find((node) => node.data.kind === 'profile' && (!node.data.profile || node.data.profile.sourceUrn === asset.urn))
  if (proposed) {
    proposed.data = { ...proposed.data, ...patch, kind: 'profile' }
    return proposed.id
  }

  const anchor = sourceNode ?? proposal.addedNodes.find((node) => node.data.kind === 'source')
  const baseId = profileId(asset.urn)
  const usedIds = new Set([...currentNodes, ...proposal.addedNodes].map((node) => node.id))
  let id = baseId
  let suffix = 2
  while (usedIds.has(id)) id = `${baseId}-${suffix++}`
  proposal.addedNodes.push({
    id,
    type: 'pipeline',
    position: { x: (anchor?.position.x ?? 120) + 285, y: Math.max(40, (anchor?.position.y ?? 240) - 185) },
    data: { kind: 'profile', ...patch } as PipelineNodeData,
  })
  return id
}

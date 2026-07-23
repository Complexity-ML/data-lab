const defaultBlankObjective = 'Start an evidence-backed autonomous incident workflow around the best available governed dataset. Propose only the next smallest useful atomic step, commit it as a restorable version, then let the player reread the resulting graph before choosing the following step. Grow incrementally toward DATA LAB Control, Data Source, Live Monitor, compact Data Profile, Impact Analysis, Agent Decision, Validation and Output with feedback; add Human Review only for uncertainty or high-risk impact. When DataHub is unavailable, create only an unbound Data Source plus Human Review and never invent metadata.'

const dataIntent = /\b(agent|analyse|analyze|audit|catalog|cards?|cartes?|columns?|colonnes?|contracts?|data|datahub|datasets?|diagrams?|fields?|graphs?|graphes?|incidents?|lineage|metadata|models?|monitors?|ownership|pipelines?|profiles?|quality|schema|sources?|sql|tables?|transforms?|validation|workspaces?)\b/i
const graphAction = /\b(add|ajoute|build|compare|continue|corrige|create|cree|detect|discover|fix|improve|investigate|monitor|patch|repair|repare|review|route|run|surveille|trace|upgrade|verify)\b/i

export interface AgentObjectiveResolution {
  accepted: boolean
  objective: string
  defaulted: boolean
}

export function resolveAgentObjective(rawObjective: string, options: { hasGraph: boolean; matchedSource: boolean }): AgentObjectiveResolution {
  const objective = rawObjective.trim().replace(/\s+/g, ' ')
  if (!objective) return { accepted: true, objective: defaultBlankObjective, defaulted: true }
  const accepted = dataIntent.test(objective)
    || options.matchedSource
    || (options.hasGraph && graphAction.test(objective))
  return { accepted, objective, defaulted: false }
}

export { defaultBlankObjective }

const defaultBlankObjective = 'Discover the best available governed starting dataset and propose the smallest evidence-backed initial graph. Use DataHub when connected; otherwise create only an unbound Data Source plus Human Review and never invent metadata.'

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

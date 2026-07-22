# Hackathon submission draft

## Project title

DATA LAB — Human-reviewed data pipeline agents

## Challenge

Agents That Do Real Work

## One-line pitch

DATA LAB turns live DataHub context into an editable card pipeline where an AI agent can find lineage and governance problems, propose a precise fix, and preserve the approved decision without taking control away from the data team.

## Description

DATA LAB is an Electron visual pipeline studio grounded in DataHub schemas, lineage, ownership, quality and governance metadata. Data teams compose pipelines from Data Source, Split, Transform, Validation and Output cards. The agent audits the graph using DataHub MCP tools, explains the exact context it read, and produces a constrained before/after diff.

In the included scenario, DataHub identifies `email` as PII and shows that a CRM activation table is downstream. DATA LAB detects that the current path has no protection, proposes a deterministic masking card, rewires the lineage and prepares a DataHub writeback. Nothing changes until a human approves the complete proposal.

## Technology

- Electron
- React + TypeScript
- React Flow
- Official MCP TypeScript SDK in Electron's isolated main process
- DataHub MCP Server over local stdio or remote Streamable HTTP
- Live entity, schema and downstream-lineage reads before every governance proposal
- Optional DataHub GraphQL API for bounded dataset refreshes
- Vitest

## Demo script — under 3 minutes

**0:00–0:20 — Problem**  
Open the starter customer activation pipeline. Explain that ordinary diagram tools do not know the real schema or downstream impact.

**0:20–0:45 — DataHub context**  
Select `Customers 360`. Show the DataHub URN, owner, schema and the PII tag on `email`. Point out the two labeled Split branches.

**0:45–1:10 — Live validation**  
Select the blocking finding: PII reaches CRM activation without masking. Briefly show that DATA LAB also validates cycles, source/output direction and orphan cards.

**1:10–1:45 — Agent does real work**  
Click **Ask agent to audit**. Show the DataHub read trace (`get_entities`, `list_schema_fields`, `get_lineage`), the reason for the change and the complete graph diff.

**1:45–2:15 — Human review**  
Approve the proposal. The graph inserts `Mask email`, replaces the direct connection and clears the blocking PII issue. Emphasize that rejection leaves the graph unchanged.

**2:15–2:40 — Knowledge inheritance**  
Show the intended writeback: save the approved masking decision and lineage in DataHub so the next person or agent inherits the context.

**2:40–2:55 — Close**  
“DATA LAB gives agents enough context to act, and gives humans enough control to trust the result.”

## Judge quick start

```bash
npm install
npm run electron:dev
```

No DataHub credentials are required for the included demo. A local Quickstart instance can be connected with `DATAHUB_GMS_URL` and `DATAHUB_GMS_TOKEN`.

# Devpost submission answers

Verified against the live **Build with DataHub: The Agent Hackathon** submission form on 2026-07-23. Keep the three operator-owned choices below explicit; do not invent them in automation.

## Required technical answers

| Field | Answer |
| --- | --- |
| Challenge category | `Agents That Do Real Work` |
| Public repository | <https://github.com/Complexity-ML/data-lab> |
| Project URL | <https://github.com/Complexity-ML/data-lab#run-the-app> |
| Sample outputs | <https://github.com/Complexity-ML/data-lab/tree/main/examples> |
| DataHub technologies | `DataHub OSS / Core Platform`, `DataHub MCP Server`, `DataHub Skills` |
| DataHub contribution | No upstream DataHub contribution is claimed. DATA LAB reports its integration findings below instead. |

## Operator-owned answers still required

1. **Country of residence** — select the real country; the repository cannot infer this.
2. **Newly created / pre-existing code declaration** — confirm whether every project-specific implementation was created during the submission period. If any LABO AI code was copied rather than merely studied, select **Includes pre-existing code** and describe the exact files or algorithms.
3. **Feedback Prize** — opt in only if desired. The form currently exposes `Yes, consider me for the Feedback Prize` and asks for the detailed feedback below.

## Feedback Prize draft

### Which parts felt polished or useful?

The Docker Quickstart and ecommerce showcase made it possible to exercise a realistic catalog locally without depending on a time-limited cloud tenant. The MCP tool boundaries were also useful: `get_entities`, `list_schema_fields`, and `get_lineage` map cleanly to dataset resolution, classified-schema inspection, and impact analysis. Once the official MCP server was connected over stdio, DATA LAB could keep credentials out of the renderer and preserve a small, auditable evidence snapshot instead of sending raw rows to the model.

### Where did you get stuck or lose time?

The biggest integration cost was discovering the exact runtime contract around local endpoints, authentication, and tool output shapes. DataHub's UI, GMS endpoint, CLI, and MCP server use related but different connection settings, and it was easy to confuse port `9002` with the GMS endpoint on `8080`. Access-token authentication was disabled in the local UI by default, while several examples naturally lead a new user toward token-based setup. Large showcase responses also caused `get_entities`, `list_schema_fields`, or `get_lineage` calls to exceed short client timeouts, so the application needed bounded retries, caching, and explicit “evidence unavailable” states instead of treating a timeout as an empty result.

### What would you build or fix first?

I would add one official, versioned “agent integration quickstart” that starts DataHub OSS, loads a small deterministic dataset, launches the MCP server, performs the three core read calls, and emits a sanitized golden response. That single path should document ports, authentication modes, expected tool names, response-size limits, and recommended timeouts. It matters because agent developers need to distinguish “the catalog says no lineage exists” from “the lineage read timed out”; conflating those states can make an agent confidently take an unsafe action.

### Bugs or unexpected behavior

- On the showcase catalog, `get_entities`, `list_schema_fields`, and `get_lineage` sometimes exceeded 12–20 second client timeouts. Expected: a bounded response or pagination guidance. Observed: the caller only received a timeout and had to preserve the metadata state as unknown.
- Local token management displayed “Token based authentication is currently disabled. Contact your DataHub administrator to enable this feature.” This is valid configuration behavior, but it made the first local MCP setup path unclear because token-oriented documentation appeared applicable.
- Tool discovery and entity payloads can be large enough that an agent application needs explicit response limits and caching. Documented recommended bounds for desktop MCP clients would reduce trial and error.

## Final external checklist

- [ ] Upload a public YouTube or Vimeo demo under three minutes and add its URL to the project.
- [ ] Supply the three operator-owned answers above.
- [ ] Submit the project to the `datahub` hackathon and verify the returned status is **Submitted**.


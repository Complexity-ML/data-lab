# DATA LAB

DATA LAB is a human-reviewed visual pipeline studio for the **Build with DataHub: The Agent Hackathon**. It turns DataHub context into editable data-flow cards, lets an agent investigate governance and lineage problems, and requires a clear review before any proposed graph change is applied.

**Primary challenge track:** Agents That Do Real Work.

**Project links:** [Devpost draft](https://devpost.com/software/data-lab) · [Public source repository](https://github.com/Complexity-ML/data-lab)

## Why it exists

Most visual pipeline builders let users connect blocks without understanding the real catalog. DATA LAB loads schema, ownership, tags and lineage from DataHub first. Its agent can therefore answer questions such as:

- Is this connection flowing in the right direction?
- Which downstream outputs will receive a PII field?
- Is a Split missing a governed branch?
- What change should be proposed, and what should be written back to the catalog?

The starter scenario detects that `customers_360.email` is tagged as PII while the CRM activation path has no masking step. The agent proposes a transform, displays its DataHub reads and graph diff, and waits for explicit human approval.

## Current MVP

- Electron desktop shell with a bright, accessible visual system.
- Directional card graph powered by React Flow.
- Data Source, Data Analysis, Split, Agent Decision, Transform, Human Review, Validation and Output cards.
- Editable card metadata and DataHub URNs.
- Local validation for cycles, orphan cards, reversed sources/outputs and incomplete splits.
- DataHub-aware PII path check.
- Agent proposal with tool trace, rationale, diff, approve and reject actions.
- Demo catalog that works without credentials.
- A real Electron-side MCP client using the official TypeScript SDK.
- Local stdio and remote Streamable HTTP transports for the official DataHub MCP Server.
- Live `get_entities`, `list_schema_fields` and `get_lineage` reads before an agent proposal.
- Card-role runner that follows the primary graph route and passes typed contracts between cards.
- Data-adaptive protection rules generated from the classified fields in the source schema.
- Confidence policy that turns Agent Decision into Human Review when evidence is sensitive or incomplete.
- Transactional pipeline versions: invalid candidates are rejected and previous checkpoints can be restored.
- Collapsible inspector and a portal-based Settings modal with Appearance, MCP, Pipeline and Versions sections.
- Optional bounded GraphQL adapter for direct dataset refresh; tokens never enter the renderer.
- Sample agent output and a ready-to-record hackathon demo script.

## Run the app

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run electron:dev
```

The web renderer can also be started on its own:

```bash
npm run dev
```

Validation:

```bash
npm test
npm run build
npm run build:electron
```

Signed macOS releases provide x64 and arm64 DMG/ZIP artifacts, a default Stable channel, and an explicit Main preview channel. See [macOS releases and updater security](docs/macos-releases.md).

## Connect a local DataHub Quickstart

DataHub's official Quickstart requires Docker with Compose v2, Python 3.10+, and enough Docker resources. The documented tested allocation is 2 CPUs, 8 GB RAM, 2 GB swap and 13 GB disk.

Install the CLI and start DataHub:

```bash
brew install datahub-project/tap/datahub
datahub docker quickstart
```

Then initialize the CLI and load the official showcase catalog:

```bash
datahub init
datahub datapack load showcase-ecommerce
```

`datahub init` stays interactive on purpose: use the local quickstart credentials printed by DataHub instead of committing a password or copying it into shell-history examples.

The DataHub UI is available at `http://localhost:9002`. Create a scoped token for the demo, then launch DATA LAB with the GMS connection owned by Electron's main process:

```bash
DATAHUB_GMS_URL=http://localhost:8080 \
DATAHUB_GMS_TOKEN=your-scoped-token \
npm run electron:dev
```

DATA LAB then starts the official open-source MCP server through `uvx mcp-server-datahub@latest`. Install [`uv`](https://docs.astral.sh/uv/getting-started/installation/) first so `uvx` is available. The server runs over stdio and mutation tools are explicitly disabled by the app.

For a remote DataHub Cloud MCP server, use Streamable HTTP instead:

```bash
DATAHUB_MCP_URL=https://your-tenant.acryl.io/integrations/ai/mcp/ \
DATAHUB_MCP_TOKEN=your-scoped-service-account-token \
npm run electron:dev
```

Do not put the token in a `VITE_*` variable: Vite variables are readable by the renderer.

Official guide: [DataHub Quickstart](https://docs.datahub.com/docs/quickstart).

For the complete verified OSS path, including sanitized MCP evidence, explicit external-provider disclosure, atomic approval and teardown, see [`docs/datahub-oss-e2e.md`](docs/datahub-oss-e2e.md) and [`examples/datahub-oss/`](examples/datahub-oss/).

## DataHub MCP and Skills workflow

The agent workflow is implemented around the DataHub MCP Server:

1. `search` / `get_entities` find the relevant source and its full metadata.
2. `list_schema_fields` identifies classified fields such as PII.
3. `get_lineage` traces the impact radius and downstream outputs.
4. The local validator turns that context into a constrained graph proposal.
5. A human approves or rejects the full diff.
6. Atomic checks validate the complete candidate before a new pipeline version is committed.
7. Mutation tools such as `save_document` or governed proposals preserve the decision for the next person or agent.

The MCP documentation distinguishes read-only and mutation tools, and mutation tools must be explicitly enabled. For unattended workflows, DataHub recommends a service account rather than a personal token.

The complementary DataHub Skills provide workflow instructions on top of MCP tools. DATA LAB maps them as follows:

- `datahub-search`: resolve trusted source datasets.
- `datahub-lineage`: inspect upstream and downstream impact.
- `datahub-quality`: check health signals before proposing a change.
- `datahub-enrich`: write approved context and governance metadata back.

See [DataHub MCP Server](https://docs.datahub.com/docs/features/feature-guides/mcp) and [DataHub Skills](https://docs.datahub.com/docs/dev-guides/agent-context/skills).

## Evidence and screenshots

- [Sanitized DataHub OSS MCP evidence](examples/datahub-oss/mcp-evidence.json)
- [Reviewed graph correction](examples/datahub-oss/reviewed-correction.json)
- [Importable approved pipeline and evidence checkpoint](examples/datahub-oss/reviewed-pipeline.json)
- [Atomic validation and replay report](examples/datahub-oss/validation-report.json)
- [Final application screenshots](docs/hackathon-submission.md#application-screenshots)

## Security model

- Electron renderer isolation is enabled (`contextIsolation`, `sandbox`, no Node integration).
- DataHub URL and token remain in the Electron main process.
- IPC only exposes status and a bounded dataset-context read.
- The renderer can request a fixed three-tool MCP audit, but cannot invoke arbitrary tools.
- MCP mutation tools are disabled for the locally launched server.
- Dataset URNs are validated and requests time out.
- Agent graph changes are proposals, never silent mutations.
- Demo mode contains no secret and works offline after dependencies are installed.

## Project structure

```text
electron/          Secure desktop shell and DataHub adapter
src/components/    Pipeline cards and human review UI
src/domain/        Typed graph, validation and agent proposal logic
examples/          Judge-readable sample agent artifacts
docs/              Architecture, submission copy and demo script
config/            DataHub MCP configuration example
```

Optional synthetic scenarios are loaded explicitly from **Settings → Examples**; the default workbench remains blank. Judge-readable expected validations and agent diffs for PII masking, ML lineage/schema impact, and broken ownership/quality are available in [`examples/presets/`](examples/presets/).

## License

Apache License 2.0. See [LICENSE](LICENSE).

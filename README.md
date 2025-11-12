# Phaset Lightweight MCP

> AI-assisted Phaset manifest generation using Model Context Protocol

A minimal MCP server that leverages Claude's intelligence to generate `phaset.manifest.json` files by analyzing your repository. Instead of implementing complex parsing logic, this server provides Claude with your project files and the Phaset schema, letting AI do the analysis.

## Quick Start

### Installation

```bash
npm install -g phaset-lightweight-mcp
```

### Configuration

**Claude Desktop** (macOS): Edit `~/Library/Application Support/Claude/claude_desktop_config.json`

**Claude Desktop** (Windows): Edit `%APPDATA%\Claude\claude_desktop_config.json`

Add:

```json
{
  "mcpServers": {
    "phaset": {
      "command": "phaset-mcp"
    }
  }
}
```

Restart Claude Desktop completely.

### Usage

In Claude Desktop:

```text
Generate a Phaset manifest for /path/to/your/project
```

Claude will:

1. Collect relevant files (package.json, README, Dockerfile, etc.)
2. Analyze your project structure
3. Generate a manifest with confidence annotations
4. Mark fields requiring manual input as TODO

## Key Features

- **100% OpenAPI Compliant**: Generated manifests strictly conform to the RecordUpdate schema with no additional fields
- **Smart analysis**: Leverages Claude's native understanding of code and configs
- **Separated concerns**: Inference notes are presented as text, not injected into the JSON
- **Multiple depth levels**: Choose minimal, standard, or deep file analysis
- **Auto-maintenance**: Improves automatically as Claude's capabilities improve
- **Language agnostic**: Works with Node.js, Go, Python, Rust, Java, and more

## Available Tools

### `get_phaset_schema`

Returns the Phaset integration API schema so Claude understands the manifest structure.

### `collect_repo_files`

Intelligently gathers relevant files from a repository based on depth:

- **minimal**: Package manifests and README only
- **standard**: Adds Dockerfiles, CI/CD configs, API specs
- **deep**: Includes infrastructure configs (Terraform, Kubernetes)

### `suggest_manifest`

Orchestrates the full workflow: retrieves schema, collects files, and generates a complete manifest draft.

## Architecture

```text
┌─────────────────┐
│   User's IDE    │
│   (Claude Code) │
└────────┬────────┘
         │
         ▼
┌──────────────────────────┐
│ Phaset MCP Server        │
│ • get_phaset_schema()    │
│ • collect_repo_files()   │
│ • suggest_manifest()     │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│ Claude (via MCP)         │
│ • Analyzes files         │
│ • Generates manifest     │
│ • Provides confidence    │
└──────────────────────────┘
```

## What Gets Generated

### High Confidence Fields ✅

Claude can reliably infer:

- `name`, `description`, `version` (from package files)
- `kind` (api/service/library/component)
- `sourcingModel` (custom vs open source)
- `deploymentModel` (cloud/saas/on-premises)
- `tags` (detected languages and frameworks)
- `api` definitions (from OpenAPI/Swagger specs)
- External dependencies

### Requires Manual Input ⚠️

Fields marked as TODO:

- `repo` (your Phaset org/record format)
- `group`, `system`, `domain` (organizational IDs)
- `dataSensitivity`, `businessCriticality` (business decisions)
- `dependencies.target` (Phaset Record IDs)
- `slo`, `baseline`, `metadata`

## Example Output

The generated response includes two parts: a valid OpenAPI-compliant JSON manifest and separate inference notes.

### Manifest (100% OpenAPI Valid)

```json
{
  "spec": {
    "repo": "TODO: YOUR_ORG/YOUR_RECORD_ID",
    "name": "user-api",
    "description": "RESTful API for user management",
    "kind": "api",
    "lifecycleStage": "production",
    "version": "2.3.1",
    "group": "TODO: 8-CHAR-ID",
    "dataSensitivity": "TODO: MANUAL",
    "sourcingModel": "custom",
    "deploymentModel": "public_cloud"
  },
  "tags": ["typescript", "express", "postgresql", "rest-api"],
  "api": [
    {
      "name": "User API",
      "schemaPath": "TODO: PUBLIC_URL_TO_SCHEMA"
    }
  ]
}
```

### Inference Notes (Presented as Text)

- **spec.name**: HIGH - Found in package.json
- **spec.description**: HIGH - Extracted from README.md
- **spec.kind**: HIGH - Identified as API based on OpenAPI spec and REST endpoints
- **spec.version**: HIGH - Found in package.json
- **spec.lifecycleStage**: MEDIUM - Inferred from production Docker configuration
- **spec.repo**: MANUAL - Organization/Record ID format required
- **spec.group**: MANUAL - Cannot determine organizational group ID
- **spec.dataSensitivity**: MANUAL - Requires business decision
- **spec.sourcingModel**: HIGH - Custom development evident from repository structure
- **spec.deploymentModel**: MEDIUM - Inferred from Kubernetes configurations
- **tags**: HIGH - Detected from package.json dependencies and file types
- **api.name**: HIGH - From OpenAPI spec title
- **api.schemaPath**: MANUAL - Needs public URL for hosted schema

## Development

### Setup

```bash
git clone <repo-url>
cd phaset-lightweight-mcp
npm install
npm run build
npm link
```

### Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage

# Development mode
npm run dev
```

## Design Philosophy: "Thin MCP, Smart Claude"

This server follows a minimal design philosophy:

1. **Provide schema** - Give Claude the Phaset structure
2. **Collect files** - Gather relevant project files
3. **Let Claude analyze** - Leverage AI's native intelligence

**Benefits**:

- 90% less code than traditional parsers
- No language-specific parsing logic needed
- Automatic improvements as Claude evolves
- Better handling of edge cases through reasoning

## Tips for Best Results

1. **Keep READMEs updated** - Claude extracts descriptions from documentation
2. **Use standard files** - package.json, Dockerfile, etc. are automatically detected
3. **Document APIs** - Include OpenAPI/Swagger specs for API detection
4. **Provide CODEOWNERS** - Helps identify contacts
5. **More files = better inference** - Use "deep" analysis for comprehensive results

## Publishing

```bash
npm version patch
npm run build
npm publish
```

## Resources and links

- [Connect to local MCP servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers)
- [Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp)
- [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector)

## License

MIT

## Contributing

Issues and PRs welcome! This project prioritizes simplicity and leveraging AI capabilities over complex implementations.

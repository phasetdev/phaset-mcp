# Phaset Manifest Generator MCP

**AI-assisted Phaset manifest generation using Model Context Protocol.**

A minimal MCP server that leverages Claude's intelligence to generate `phaset.manifest.json` files by analyzing your repository.

_This may or may not work with other MCP-compatible tools, such as ChatGPT, but no testing has been done for anything other than Claude._

## Quick Start

### Installation

You will need to have [Node.js](https://nodejs.org/en) installed.

```bash
npm install -g phaset-mcp
```

### Configuration

#### Claude Desktop

**(macOS)**: Edit `~/Library/Application Support/Claude/claude_desktop_config.json`

**(Windows)**: Edit `%APPDATA%\Claude\claude_desktop_config.json`

Add:

```json
{
  "mcpServers": {
    "phaset": {
      "command": "npx",
      "args": ["-y", "phaset-mcp"]
    }
  }
}
```

Restart Claude Desktop completely.

#### Claude Code

Add the below to `.claude.json`:

```json
{
  "mcpServers": {
    "phaset": {
      "command": "npx",
      "args": ["-y", "phaset-mcp"]
    }
  }
}
```

#### CLI

Run:

```bash
claude mcp add phaset -- npx -y phaset-mcp
```

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

- **100% Phaset Compliant**: Generated manifests strictly conform to the Phaset schema
- **Smart analysis**: Leverages Claude's native understanding of code and configs
- **Helpful notes**: Inference notes are presented as complementary text
- **Multiple depth levels**: Choose minimal, standard, or deep file analysis
- **Language agnostic**: Works with any language Claude understands

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

The generated response includes two parts: a valid JSON manifest and separate inference notes.

### Manifest

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

## Tips for Best Results

1. **Keep READMEs updated** - Claude extracts descriptions from documentation
2. **Use standard files** - package.json, Dockerfile, etc. are automatically detected
3. **Document APIs** - Include OpenAPI/Swagger specs for API detection
4. **Provide CODEOWNERS** - Helps identify contacts
5. **More files = better inference** - Use "deep" analysis for comprehensive results

## Resources and links

- [Connect to local MCP servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers)
- [Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp)
- [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector)

## License

MIT. See the `LICENSE` file.

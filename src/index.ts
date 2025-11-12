#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { findFiles } from './fileUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCHEMA_PATH = path.join(__dirname, '../integration.schema.yml');

const PROMPT_TEMPLATE = `You are helping generate a Phaset manifest (phaset.manifest.json) for a software repository.

**Your task:**
1. Analyze the provided files
2. Generate a valid RecordUpdate JSON object following the Phaset schema EXACTLY
3. Mark fields you cannot infer as "TODO: MANUAL"
4. Provide your inference notes SEPARATELY after the JSON

**Critical Rules - Schema Validation:**
- The manifest MUST conform to the OpenAPI RecordUpdate schema exactly
- Do NOT add any custom fields or properties not defined in the schema
- Do NOT include "inference_notes", "confidence", "comments" or any metadata fields in the JSON
- Only use fields and values that are explicitly defined in the OpenAPI specification
- All enum values must match the schema exactly (case-sensitive)
- All required fields must be present: spec (with repo and name)

**Critical Rules - Inference:**
- Do NOT hallucinate organizational IDs (repo, group, system, domain)
- Do NOT guess data sensitivity or business criticality
- Be conservative: omit fields rather than guess incorrectly
- Mark uninferable values as "TODO: MANUAL" as a placeholder string value
- For organizational IDs (group, system, domain): use "TODO: 8-CHAR-ID" or omit entirely
- For repo: use "TODO: ORG_ID/RECORD_ID" format

**Output Format:**
You MUST provide your response in exactly this structure:

\`\`\`json
{
  "spec": {
    "repo": "...",
    "name": "..."
    // ... only valid RecordUpdate fields
  }
  // ... other valid top-level RecordUpdate fields only
}
\`\`\`

## Inference Notes

[Provide your analysis here as text, NOT in the JSON]

- **Field name**: Confidence level (HIGH/MEDIUM/LOW/MANUAL) - Explanation
- Example: **spec.name**: HIGH - Found in package.json
- Example: **spec.group**: MANUAL - Cannot determine organizational group ID from files

Generate the manifest now:`;

class PhasetMCPServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer(
      {
        name: 'phaset-manifest-generator',
        version: '0.0.1'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupToolHandlers();

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    // Register get_phaset_schema tool
    this.server.registerTool(
      'get_phaset_schema',
      {
        description:
          'Get the Phaset integration API schema (RecordUpdate structure) for manifest generation',
        inputSchema: {}
      },
      async () => {
        return await this.getPhasetSchema();
      }
    );

    // Register collect_repo_files tool
    this.server.registerTool(
      'collect_repo_files',
      {
        description:
          'Collect relevant files from a repository for Phaset manifest analysis. Returns file contents that can be analyzed to generate a manifest.',
        inputSchema: {
          path: z
            .string()
            .describe('Absolute path to repository root directory'),
          depth: z
            .enum(['minimal', 'standard', 'deep'])
            .optional()
            .describe(
              'How extensively to scan files (minimal=package files only, standard=includes deployment configs, deep=includes infrastructure)'
            )
        }
      },
      async (args) => {
        return await this.collectRepoFiles({
          path: args.path,
          depth: args.depth
        });
      }
    );

    // Register suggest_manifest tool
    this.server.registerTool(
      'suggest_manifest',
      {
        description:
          'Analyze a repository and generate a Phaset manifest suggestion. This orchestrates schema retrieval and file collection, then provides them for AI analysis.',
        inputSchema: {
          path: z
            .string()
            .describe('Absolute path to repository root directory'),
          depth: z
            .enum(['minimal', 'standard', 'deep'])
            .optional()
            .describe('Analysis depth (default: standard)')
        }
      },
      async (args) => {
        return await this.suggestManifest({
          path: args.path,
          depth: args.depth
        });
      }
    );
  }

  private async getPhasetSchema() {
    try {
      const schema = await fs.readFile(SCHEMA_PATH, 'utf-8');
      return {
        content: [
          {
            type: 'text' as const,
            text: schema
          }
        ]
      };
    } catch (error) {
      throw new Error(
        `Failed to read Phaset schema: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async collectRepoFiles(args: { path: string; depth?: string }) {
    const { path: repoPath, depth = 'standard' } = args;

    try {
      // Verify path exists
      const stats = await fs.stat(repoPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${repoPath}`);
      }

      const patterns = this.getFilePatterns(depth);
      const files = await this.findAndReadFiles(repoPath, patterns);

      if (files.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  repoPath,
                  filesCollected: 0,
                  warning:
                    'No relevant files found. This may not be a software repository or it may use an unsupported structure.',
                  files: []
                },
                null,
                2
              )
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                repoPath,
                filesCollected: files.length,
                depth,
                files: files.map((f) => ({
                  path: f.path,
                  sizeBytes: f.content.length,
                  content: f.content
                }))
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      throw new Error(
        `Failed to collect files: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async suggestManifest(args: { path: string; depth?: string }) {
    const { path: repoPath, depth = 'standard' } = args;

    try {
      // Verify path exists
      const stats = await fs.stat(repoPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${repoPath}`);
      }

      // Get schema
      const schema = await fs.readFile(SCHEMA_PATH, 'utf-8');

      // Collect files
      const patterns = this.getFilePatterns(depth);
      const files = await this.findAndReadFiles(repoPath, patterns);

      if (files.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `I couldn't find any relevant files in the repository at ${repoPath}.

This might mean:
- The path is incorrect
- This is not a software repository
- The repository uses an unsupported structure

Please verify the path and try again.`
            }
          ]
        };
      }

      // Build context for Claude
      const filesContext = files
        .map(
          (f) => `### File: ${f.path}
\`\`\`
${f.content}
\`\`\`
`
        )
        .join('\n\n');

      return {
        content: [
          {
            type: 'text' as const,
            text: `# Phaset Manifest Generation for ${repoPath}

I've collected ${files.length} files from the repository. Let me analyze them to generate a Phaset manifest.

## Phaset Integration API Schema

${schema}

---

## Repository Files

${filesContext}

---

${PROMPT_TEMPLATE}`
          }
        ]
      };
    } catch (error) {
      throw new Error(
        `Failed to generate manifest suggestion: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private getFilePatterns(depth: string): string[] {
    const minimal = [
      'package.json',
      'package-lock.json',
      'go.mod',
      'go.sum',
      'pom.xml',
      'build.gradle',
      'build.gradle.kts',
      'requirements.txt',
      'setup.py',
      'pyproject.toml',
      'Cargo.toml',
      'Cargo.lock',
      'Gemfile',
      'Gemfile.lock',
      'composer.json',
      'README.md',
      'README.txt',
      'README',
      'readme.md',
      'LICENSE',
      'LICENSE.txt',
      'LICENSE.md'
    ];

    const standard = [
      ...minimal,
      'Dockerfile',
      'Dockerfile.*',
      'docker-compose.yml',
      'docker-compose.yaml',
      '.dockerignore',
      '.github/workflows/*.yml',
      '.github/workflows/*.yaml',
      '.gitlab-ci.yml',
      'azure-pipelines.yml',
      'Jenkinsfile',
      'openapi.yaml',
      'openapi.yml',
      'openapi.json',
      'swagger.json',
      'swagger.yaml',
      'swagger.yml',
      'api-spec.yaml',
      'api-spec.yml',
      'schema.graphql',
      '*.graphql',
      'CODEOWNERS',
      '.env.example',
      '.env.sample',
      'Makefile',
      'justfile'
    ];

    const deep = [
      ...standard,
      'terraform/**/*.tf',
      'terraform/*.tf',
      'k8s/**/*.yaml',
      'k8s/**/*.yml',
      'kubernetes/**/*.yaml',
      'kubernetes/**/*.yml',
      '.k8s/**/*.yaml',
      'helm/**/*.yaml',
      'config/*.json',
      'config/*.yaml',
      'config/*.yml',
      '.circleci/config.yml',
      'bitbucket-pipelines.yml',
      'cloudbuild.yaml',
      'skaffold.yaml',
      'serverless.yml',
      'serverless.yaml'
    ];

    const patterns: Record<string, string[]> = {
      minimal,
      standard,
      deep
    };

    return patterns[depth] || standard;
  }

  private getFilePriority(filePath: string): number {
    // Lower number = higher priority
    const fileName = path.basename(filePath);
    const dirName = path.dirname(filePath);

    // Highest priority: package managers and README
    if (fileName === 'package.json') return 1;
    if (fileName.toLowerCase().startsWith('readme')) return 2;

    // High priority: other package manager files
    if (['go.mod', 'pom.xml', 'build.gradle', 'Cargo.toml', 'pyproject.toml', 'setup.py', 'requirements.txt', 'Gemfile', 'composer.json'].includes(fileName)) return 3;

    // Medium-high priority: API specs and main config files
    if (fileName.startsWith('openapi.') || fileName.startsWith('swagger.') || fileName.includes('api-spec')) return 4;
    if (fileName === 'Dockerfile' || fileName === 'docker-compose.yml' || fileName === 'docker-compose.yaml') return 5;

    // Medium priority: CI/CD configs
    if (dirName.includes('.github/workflows') || fileName === '.gitlab-ci.yml' || fileName === 'Jenkinsfile') return 6;

    // Lower priority: infrastructure as code
    if (filePath.includes('terraform/') || filePath.includes('k8s/') || filePath.includes('kubernetes/')) return 8;

    // Default priority
    return 7;
  }

  private estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  private truncateContent(content: string, maxChars: number): string {
    if (content.length <= maxChars) return content;

    const truncated = content.substring(0, maxChars);
    return `${truncated}\n\n... [Content truncated - file too large. Showing first ${maxChars} characters]`;
  }

  private async findAndReadFiles(
    repoPath: string,
    patterns: string[]
  ): Promise<Array<{ path: string; content: string }>> {
    const MAX_FILE_SIZE = 50000; // Max chars per file (≈12.5k tokens)
    const MAX_TOTAL_TOKENS = 15000; // Budget for all file contents combined

    const allFiles: Array<{ path: string; priority: number }> = [];
    const seenPaths = new Set<string>();
    const results: Array<{ path: string; content: string }> = [];
    let totalTokens = 0;

    try {
      const matches = await findFiles(repoPath, patterns, {
        ignore: [
          'node_modules/**',
          '.git/**',
          'dist/**',
          'build/**',
          'target/**',
          '.next/**',
          'out/**',
          'vendor/**',
          '.venv/**',
          'venv/**',
          '__pycache__/**',
          '*.pyc',
          '.idea/**',
          '.vscode/**',
          'coverage/**',
          '.coverage/**'
        ]
      });

      // Collect all files with their priorities
      for (const match of matches) {
        if (seenPaths.has(match)) continue;
        seenPaths.add(match);

        const priority = this.getFilePriority(match);
        allFiles.push({ path: match, priority });
      }

      // Sort by priority (lower number first)
      allFiles.sort((a, b) => a.priority - b.priority);

      // Read files until we hit our token budget
      for (const { path: match } of allFiles) {
        try {
          const fullPath = path.join(repoPath, match);
          let content = await fs.readFile(fullPath, 'utf-8');

          // Skip binary files
          if (content.includes('\0')) {
            console.error(`Skipping ${match}: appears to be binary`);
            continue;
          }

          // Truncate large files
          if (content.length > MAX_FILE_SIZE) {
            console.error(
              `Truncating ${match}: too large (${content.length} chars, keeping first ${MAX_FILE_SIZE})`
            );
            content = this.truncateContent(content, MAX_FILE_SIZE);
          }

          const tokens = this.estimateTokens(content);

          // Stop if adding this file would exceed our budget
          if (totalTokens + tokens > MAX_TOTAL_TOKENS) {
            console.error(
              `Reached token budget limit (${totalTokens}/${MAX_TOTAL_TOKENS}). Collected ${results.length} files. Skipping remaining ${allFiles.length - results.length} files.`
            );
            break;
          }

          results.push({
            path: match,
            content
          });
          totalTokens += tokens;

        } catch (error) {
          // Skip files that can't be read (permission errors, etc.)
          console.error(
            `Could not read ${match}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      console.error(
        `Collected ${results.length} files (≈${totalTokens} tokens)`
      );

    } catch (error) {
      console.error(
        `File search failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return results;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Phaset MCP server running on stdio');
  }
}

const server = new PhasetMCPServer();
server.run().catch(console.error);

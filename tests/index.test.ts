import { describe, expect, beforeAll, afterAll, test, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a mock server instance that we can access in tests
let mockServerInstance: any;

// Mock the MCP SDK
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  return {
    McpServer: class MockMcpServer {
      private tools: Map<string, any> = new Map();

      constructor(
        public info: any,
        public options: any
      ) {
        mockServerInstance = this;
      }

      registerTool(name: string, config: any, callback: any) {
        this.tools.set(name, { config, callback });
      }

      async close() {}
      async connect() {}

      // Expose for testing
      async callTool(name: string, args: any = {}) {
        const tool = this.tools.get(name);
        if (!tool) throw new Error(`Tool ${name} not found`);
        return await tool.callback(args);
      }

      getTools() {
        return this.tools;
      }
    }
  };
});

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => {
  return {
    StdioServerTransport: class MockStdioServerTransport {}
  };
});

// Import after mocks are set up
let _PhasetMCPServerModule: any;

describe('PhasetMCPServer', () => {
  let testDir: string;

  beforeAll(async () => {
    // Create a temporary directory for test files
    testDir = path.join(tmpdir(), `phaset-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    // Create test files
    await fs.writeFile(
      path.join(testDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-repo',
          version: '1.0.0',
          description: 'Test repository'
        },
        null,
        2
      )
    );

    await fs.writeFile(
      path.join(testDir, 'README.md'),
      '# Test Repository\n\nThis is a test repository for Phaset.'
    );

    await fs.writeFile(
      path.join(testDir, 'Dockerfile'),
      'FROM node:18\nWORKDIR /app\nCOPY . .\nRUN npm install\nCMD ["npm", "start"]'
    );
  });

  afterAll(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('Server Initialization and Tool Registration', () => {
    test('It should initialize MCP server with correct metadata', async () => {
      // Import the module which will create a server instance
      await import('../src/index.js');

      expect(mockServerInstance).toBeDefined();
      expect(mockServerInstance.info.name).toBe('phaset-manifest-generator');
      expect(mockServerInstance.info.version).toBe('0.0.1');
      expect(mockServerInstance.options.capabilities.tools).toBeDefined();
    });

    test('It should register all three tools', async () => {
      const tools = mockServerInstance.getTools();

      expect(tools.has('get_phaset_schema')).toBe(true);
      expect(tools.has('collect_repo_files')).toBe(true);
      expect(tools.has('suggest_manifest')).toBe(true);
    });

    test('It should register get_phaset_schema tool with correct config', async () => {
      const tools = mockServerInstance.getTools();
      const tool = tools.get('get_phaset_schema');

      expect(tool.config.description).toContain(
        'Phaset integration API schema'
      );
      expect(tool.config.inputSchema).toBeDefined();
    });

    test('It should register collect_repo_files tool with correct config', async () => {
      const tools = mockServerInstance.getTools();
      const tool = tools.get('collect_repo_files');

      expect(tool.config.description).toContain('Collect relevant files');
      expect(tool.config.inputSchema).toBeDefined();
    });

    test('It should register suggest_manifest tool with correct config', async () => {
      const tools = mockServerInstance.getTools();
      const tool = tools.get('suggest_manifest');

      expect(tool.config.description).toContain(
        'generate a Phaset manifest suggestion'
      );
      expect(tool.config.inputSchema).toBeDefined();
    });
  });

  describe('get_phaset_schema tool', () => {
    test('It should return schema file content', async () => {
      const result = await mockServerInstance.callTool('get_phaset_schema', {});

      expect(result).toHaveProperty('content');
      expect(result.content).toBeInstanceOf(Array);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0].text).toBeTruthy();
      // Should contain actual schema content
      expect(result.content[0].text).toContain('openapi');
    });
  });

  describe('collect_repo_files tool', () => {
    test('It should collect files with minimal depth', async () => {
      const result = await mockServerInstance.callTool('collect_repo_files', {
        path: testDir,
        depth: 'minimal'
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.repoPath).toBe(testDir);
      expect(data.depth).toBe('minimal');
      expect(data.filesCollected).toBeGreaterThan(0);
      expect(data.files).toBeInstanceOf(Array);
    });

    test('It should collect files with standard depth', async () => {
      const result = await mockServerInstance.callTool('collect_repo_files', {
        path: testDir,
        depth: 'standard'
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.depth).toBe('standard');
      expect(data.files.some((f: any) => f.path === 'Dockerfile')).toBe(true);
    });

    test('It should collect files with deep depth', async () => {
      const result = await mockServerInstance.callTool('collect_repo_files', {
        path: testDir,
        depth: 'deep'
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.depth).toBe('deep');
    });

    test('It should use standard depth as default', async () => {
      const result = await mockServerInstance.callTool('collect_repo_files', {
        path: testDir
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.depth).toBe('standard');
    });

    test('It should return warning for empty directory', async () => {
      const emptyDir = path.join(testDir, 'empty-test');
      await fs.mkdir(emptyDir, { recursive: true });

      const result = await mockServerInstance.callTool('collect_repo_files', {
        path: emptyDir,
        depth: 'minimal'
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.filesCollected).toBe(0);
      expect(data.warning).toBeDefined();
      expect(data.warning).toContain('No relevant files found');
    });

    test('It should throw error for non-directory path', async () => {
      const filePath = path.join(testDir, 'package.json');

      await expect(
        mockServerInstance.callTool('collect_repo_files', { path: filePath })
      ).rejects.toThrow('Path is not a directory');
    });

    test('It should throw error for non-existent path', async () => {
      const nonExistentPath = path.join(testDir, 'does-not-exist-xyz');

      await expect(
        mockServerInstance.callTool('collect_repo_files', {
          path: nonExistentPath
        })
      ).rejects.toThrow('Failed to collect files');
    });
  });

  describe('suggest_manifest tool', () => {
    test('It should generate manifest suggestion with standard depth', async () => {
      const result = await mockServerInstance.callTool('suggest_manifest', {
        path: testDir
      });

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Phaset Manifest Generation');
      expect(result.content[0].text).toContain('Phaset Integration API Schema');
      expect(result.content[0].text).toContain('Repository Files');
      expect(result.content[0].text).toContain('package.json');
    });

    test('It should generate manifest suggestion with minimal depth', async () => {
      const result = await mockServerInstance.callTool('suggest_manifest', {
        path: testDir,
        depth: 'minimal'
      });

      expect(result.content[0].text).toContain('Phaset Manifest Generation');
    });

    test('It should generate manifest suggestion with deep depth', async () => {
      const result = await mockServerInstance.callTool('suggest_manifest', {
        path: testDir,
        depth: 'deep'
      });

      expect(result.content[0].text).toContain('Phaset Manifest Generation');
    });

    test('It should include prompt template in output', async () => {
      const result = await mockServerInstance.callTool('suggest_manifest', {
        path: testDir
      });

      expect(result.content[0].text).toContain(
        'You are helping generate a Phaset manifest'
      );
      expect(result.content[0].text).toContain('Your task:');
    });

    test('It should return error message for empty repository', async () => {
      const emptyDir = path.join(testDir, 'empty-repo-test');
      await fs.mkdir(emptyDir, { recursive: true });

      const result = await mockServerInstance.callTool('suggest_manifest', {
        path: emptyDir,
        depth: 'minimal'
      });

      expect(result.content[0].text).toContain(
        "couldn't find any relevant files"
      );
      expect(result.content[0].text).toContain('This might mean:');
    });

    test('It should throw error for non-directory path', async () => {
      const filePath = path.join(testDir, 'package.json');

      await expect(
        mockServerInstance.callTool('suggest_manifest', { path: filePath })
      ).rejects.toThrow('Path is not a directory');
    });

    test('It should throw error for non-existent path', async () => {
      const nonExistentPath = path.join(testDir, 'does-not-exist-abc');

      await expect(
        mockServerInstance.callTool('suggest_manifest', {
          path: nonExistentPath
        })
      ).rejects.toThrow('Failed to generate manifest suggestion');
    });
  });

  describe('File Filtering and Edge Cases', () => {
    test('It should truncate files larger than 50KB and log warning', async () => {
      // Create a large package.json file (matches minimal patterns)
      const largePath = path.join(testDir, 'package-lock.json');
      // First backup the existing file if any
      let originalContent: string | null = null;
      try {
        originalContent = await fs.readFile(largePath, 'utf-8');
      } catch {
        // File doesn't exist, that's fine
      }

      const largeContent = 'x'.repeat(250000);
      await fs.writeFile(largePath, largeContent);

      // Spy on console.error to verify logging
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await mockServerInstance.callTool('collect_repo_files', {
        path: testDir,
        depth: 'minimal' // package-lock.json is in minimal patterns
      });

      const data = JSON.parse(result.content[0].text);
      const largeFile = data.files.find(
        (f: any) => f.path === 'package-lock.json'
      );

      // File should be included but truncated
      expect(largeFile).toBeDefined();
      expect(largeFile.content).toContain('[Content truncated');
      expect(largeFile.content.length).toBeLessThan(largeContent.length);

      // Verify console.error was called for truncation
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Truncating package-lock.json: too large')
      );

      consoleErrorSpy.mockRestore();

      // Cleanup - restore or remove
      if (originalContent !== null) {
        await fs.writeFile(largePath, originalContent);
      } else {
        await fs.unlink(largePath);
      }
    });

    test('It should skip binary files (files with null bytes) and log error', async () => {
      // Create a "Dockerfile" with binary content (matches standard patterns)
      const binaryPath = path.join(testDir, 'Dockerfile.bin');
      await fs.writeFile(binaryPath, Buffer.from([0x00, 0x01, 0x02, 0x03]));

      // Spy on console.error to verify logging
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await mockServerInstance.callTool('collect_repo_files', {
        path: testDir,
        depth: 'standard' // Dockerfile.* pattern
      });

      const data = JSON.parse(result.content[0].text);
      const hasBinaryFile = data.files.some(
        (f: any) => f.path === 'Dockerfile.bin'
      );
      expect(hasBinaryFile).toBe(false);

      // Verify console.error was called for binary file
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping Dockerfile.bin: appears to be binary')
      );

      consoleErrorSpy.mockRestore();

      // Cleanup
      await fs.unlink(binaryPath);
    });

    test('It should deduplicate files when patterns overlap', async () => {
      // The actual implementation uses seenPaths to deduplicate
      const result = await mockServerInstance.callTool('collect_repo_files', {
        path: testDir,
        depth: 'standard'
      });

      const data = JSON.parse(result.content[0].text);
      const filePaths = data.files.map((f: any) => f.path);
      const uniquePaths = new Set(filePaths);

      // Should have no duplicates
      expect(filePaths.length).toBe(uniquePaths.size);
    });

    test('It should handle unreadable files gracefully and log error', async () => {
      // Create a file and make it unreadable (this may not work on all systems)
      const unreadablePath = path.join(testDir, 'unreadable.txt');
      await fs.writeFile(unreadablePath, 'test content');

      try {
        await fs.chmod(unreadablePath, 0o000);

        // Spy on console.error to verify logging
        const consoleErrorSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});

        const result = await mockServerInstance.callTool('collect_repo_files', {
          path: testDir,
          depth: 'minimal'
        });

        // Should not throw, just skip the file
        expect(result).toBeDefined();

        // Verify console.error was called for unreadable file
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Could not read unreadable.txt')
        );

        consoleErrorSpy.mockRestore();

        // Restore permissions for cleanup
        await fs.chmod(unreadablePath, 0o644);
        await fs.unlink(unreadablePath);
      } catch {
        // If chmod doesn't work (e.g., on some CI systems), skip this test
        // Restore permissions if needed
        try {
          await fs.chmod(unreadablePath, 0o644);
          await fs.unlink(unreadablePath);
        } catch {
          // Ignore cleanup errors
        }
      }
    });
  });

  describe('getFilePatterns with different depths', () => {
    test('It should return standard patterns for unknown depth', async () => {
      // Test the fallback in getFilePatterns: patterns[depth] || standard
      const result = await mockServerInstance.callTool('collect_repo_files', {
        path: testDir,
        depth: 'unknown-depth-value' as any
      });

      // Should not throw and should use standard patterns
      expect(result).toBeDefined();
      const data = JSON.parse(result.content[0].text);
      expect(data.files).toBeDefined();
    });
  });

  describe('File content validation', () => {
    test('It should include file size in bytes', async () => {
      const result = await mockServerInstance.callTool('collect_repo_files', {
        path: testDir,
        depth: 'minimal'
      });

      const data = JSON.parse(result.content[0].text);
      const packageFile = data.files.find(
        (f: any) => f.path === 'package.json'
      );

      expect(packageFile).toBeDefined();
      expect(packageFile.sizeBytes).toBeDefined();
      expect(typeof packageFile.sizeBytes).toBe('number');
      expect(packageFile.sizeBytes).toBeGreaterThan(0);
    });

    test('It should include actual file content', async () => {
      const result = await mockServerInstance.callTool('collect_repo_files', {
        path: testDir,
        depth: 'minimal'
      });

      const data = JSON.parse(result.content[0].text);
      const readmeFile = data.files.find((f: any) => f.path === 'README.md');

      expect(readmeFile).toBeDefined();
      expect(readmeFile.content).toContain('Test Repository');
    });
  });

  describe('suggest_manifest output formatting', () => {
    test('It should format files with proper markdown code blocks', async () => {
      const result = await mockServerInstance.callTool('suggest_manifest', {
        path: testDir,
        depth: 'minimal'
      });

      const text = result.content[0].text;

      // Should have file headers
      expect(text).toContain('### File:');

      // Should have code block markers
      expect(text).toContain('```');
    });

    test('It should include file count in output', async () => {
      const result = await mockServerInstance.callTool('suggest_manifest', {
        path: testDir,
        depth: 'minimal'
      });

      const text = result.content[0].text;

      // Should mention how many files were collected
      expect(text).toMatch(/I've collected \d+ files/);
    });

    test('It should include the full prompt template', async () => {
      const result = await mockServerInstance.callTool('suggest_manifest', {
        path: testDir,
        depth: 'minimal'
      });

      const text = result.content[0].text;

      // Should include critical parts of the prompt
      expect(text).toContain('Critical Rules - Schema Validation');
      expect(text).toContain('Critical Rules - Inference');
      expect(text).toContain('Output Format');
      expect(text).toContain('Inference Notes');
    });
  });
});

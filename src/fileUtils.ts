import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Simple glob-like pattern matching
 * Supports:
 * - Exact matches: "package.json"
 * - Wildcards: "*.json"
 * - Directory wildcards: "**\/*.yaml"
 * - Dot files: enabled by default
 */
export async function findFiles(
  baseDir: string,
  patterns: string[],
  options: {
    ignore?: string[];
    maxDepth?: number;
  } = {}
): Promise<string[]> {
  const { ignore = [], maxDepth = 10 } = options;
  const results = new Set<string>();

  // Normalize patterns and ignore lists
  const normalizedPatterns = patterns.map((p) => normalizePattern(p));
  const normalizedIgnore = ignore.map((p) => normalizePattern(p));

  async function walk(dir: string, depth: number = 0) {
    if (depth > maxDepth) return;

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const relativePath = path.relative(baseDir, path.join(dir, entry.name));

        // Check if this path should be ignored
        if (shouldIgnore(relativePath, normalizedIgnore)) {
          continue;
        }

        if (entry.isDirectory()) {
          await walk(path.join(dir, entry.name), depth + 1);
        } else if (entry.isFile()) {
          // Check if this file matches any pattern
          if (matchesAnyPattern(relativePath, normalizedPatterns)) {
            results.add(relativePath);
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
      console.error(
        `Cannot read directory ${dir}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  await walk(baseDir);
  return Array.from(results).sort();
}

function normalizePattern(pattern: string): string {
  // Normalize path separators
  return pattern.replace(/\\/g, '/');
}

function shouldIgnore(filePath: string, ignorePatterns: string[]): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');

  for (const pattern of ignorePatterns) {
    if (matchPattern(normalizedPath, pattern)) {
      return true;
    }
  }

  return false;
}

function matchesAnyPattern(filePath: string, patterns: string[]): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');

  for (const pattern of patterns) {
    if (matchPattern(normalizedPath, pattern)) {
      return true;
    }
  }

  return false;
}

function matchPattern(filePath: string, pattern: string): boolean {
  // Convert glob pattern to regex
  // Handle ** (match any number of directories including none)
  // Handle * (match any characters except /)
  // Handle exact matches

  let regexPattern = pattern
    // Escape special regex characters except * and /
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    // Replace **/ with a special marker
    .replace(/\*\*\//g, '___DOUBLESTAR_SLASH___')
    // Replace /** with a special marker
    .replace(/\/\*\*/g, '___SLASH_DOUBLESTAR___')
    // Replace standalone ** with a special marker
    .replace(/\*\*/g, '___DOUBLESTAR___')
    // Replace single * with regex for matching anything except /
    .replace(/\*/g, '[^/]*')
    // Replace **/ with regex that matches zero or more path segments
    .replace(/___DOUBLESTAR_SLASH___/g, '(?:.*/)?')
    // Replace /** with regex that matches anything after a slash
    .replace(/___SLASH_DOUBLESTAR___/g, '/.*')
    // Replace standalone ** with regex for matching anything
    .replace(/___DOUBLESTAR___/g, '.*');

  // Anchor the pattern
  regexPattern = `^${regexPattern}$`;

  const regex = new RegExp(regexPattern);
  return regex.test(filePath);
}

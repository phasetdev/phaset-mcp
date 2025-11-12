import { describe, expect, beforeEach, afterEach, test } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findFiles } from '../src/fileUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DIR = path.join(__dirname, 'fixtures', 'fileUtils-test');

describe('fileUtils', () => {
  describe('findFiles', () => {
    beforeEach(async () => {
      // Create test directory structure
      await fs.mkdir(TEST_DIR, { recursive: true });
      await fs.mkdir(path.join(TEST_DIR, 'src'), { recursive: true });
      await fs.mkdir(path.join(TEST_DIR, 'src', 'utils'), { recursive: true });
      await fs.mkdir(path.join(TEST_DIR, 'dist'), { recursive: true });
      await fs.mkdir(path.join(TEST_DIR, 'node_modules'), { recursive: true });
      await fs.mkdir(path.join(TEST_DIR, '.config'), { recursive: true });

      // Create test files
      await fs.writeFile(path.join(TEST_DIR, 'package.json'), '{}');
      await fs.writeFile(path.join(TEST_DIR, 'package-lock.json'), '{}');
      await fs.writeFile(path.join(TEST_DIR, 'README.md'), '# Test');
      await fs.writeFile(path.join(TEST_DIR, 'tsconfig.json'), '{}');
      await fs.writeFile(path.join(TEST_DIR, 'src', 'index.ts'), 'export {}');
      await fs.writeFile(path.join(TEST_DIR, 'src', 'app.ts'), 'export {}');
      await fs.writeFile(
        path.join(TEST_DIR, 'src', 'utils', 'helper.ts'),
        'export {}'
      );
      await fs.writeFile(
        path.join(TEST_DIR, 'src', 'utils', 'format.js'),
        'export {}'
      );
      await fs.writeFile(path.join(TEST_DIR, 'dist', 'index.js'), 'export {}');
      await fs.writeFile(
        path.join(TEST_DIR, 'node_modules', 'lib.js'),
        'export {}'
      );
      await fs.writeFile(path.join(TEST_DIR, '.gitignore'), 'node_modules');
      await fs.writeFile(path.join(TEST_DIR, '.config', 'settings.yml'), '{}');
    });

    afterEach(async () => {
      // Clean up test directory
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    });

    describe('exact file matching', () => {
      test('It should find an exact file match', async () => {
        const files = await findFiles(TEST_DIR, ['package.json']);

        expect(files).toHaveLength(1);
        expect(files[0]).toBe('package.json');
      });

      test('It should find multiple exact file matches', async () => {
        const files = await findFiles(TEST_DIR, [
          'package.json',
          'package-lock.json'
        ]);

        expect(files).toHaveLength(2);
        expect(files).toContain('package.json');
        expect(files).toContain('package-lock.json');
      });

      test('It should return empty array if file does not exist', async () => {
        const files = await findFiles(TEST_DIR, ['nonexistent.txt']);

        expect(files).toHaveLength(0);
      });

      test('It should find files in subdirectories with exact path', async () => {
        const files = await findFiles(TEST_DIR, ['src/index.ts']);

        expect(files).toHaveLength(1);
        expect(files[0]).toBe('src/index.ts');
      });
    });

    describe('wildcard patterns', () => {
      test('It should match files with * wildcard', async () => {
        const files = await findFiles(TEST_DIR, ['*.json']);

        expect(files.length).toBeGreaterThanOrEqual(3);
        expect(files).toContain('package.json');
        expect(files).toContain('package-lock.json');
        expect(files).toContain('tsconfig.json');
      });

      test('It should match files with extension wildcard', async () => {
        const files = await findFiles(TEST_DIR, ['*.md']);

        expect(files).toHaveLength(1);
        expect(files[0]).toBe('README.md');
      });

      test('It should match TypeScript files in src directory', async () => {
        const files = await findFiles(TEST_DIR, ['src/*.ts']);

        expect(files).toHaveLength(2);
        expect(files).toContain('src/index.ts');
        expect(files).toContain('src/app.ts');
      });

      test('It should not match files in subdirectories with single wildcard', async () => {
        const files = await findFiles(TEST_DIR, ['src/*.ts']);

        expect(files).not.toContain('src/utils/helper.ts');
      });
    });

    describe('directory wildcard patterns (**)', () => {
      test('It should match all TypeScript files recursively', async () => {
        const files = await findFiles(TEST_DIR, ['**/*.ts']);

        expect(files.length).toBeGreaterThanOrEqual(3);
        expect(files).toContain('src/index.ts');
        expect(files).toContain('src/app.ts');
        expect(files).toContain('src/utils/helper.ts');
      });

      test('It should match all JavaScript files recursively', async () => {
        const files = await findFiles(TEST_DIR, ['**/*.js']);

        // Should find files in src/utils and dist, but not node_modules (excluded by default in our usage)
        const jsFiles = files.filter((f) => f.endsWith('.js'));
        expect(jsFiles.length).toBeGreaterThanOrEqual(1);
        expect(files).toContain('src/utils/format.js');
      });

      test('It should match files in nested directories', async () => {
        const files = await findFiles(TEST_DIR, ['src/**/*.ts']);

        expect(files.length).toBeGreaterThanOrEqual(3);
        expect(files).toContain('src/index.ts');
        expect(files).toContain('src/app.ts');
        expect(files).toContain('src/utils/helper.ts');
      });

      test('It should match all files in a directory recursively', async () => {
        const files = await findFiles(TEST_DIR, ['src/**/*']);

        expect(files.length).toBeGreaterThanOrEqual(4);
        expect(files).toContain('src/index.ts');
        expect(files).toContain('src/app.ts');
        expect(files).toContain('src/utils/helper.ts');
        expect(files).toContain('src/utils/format.js');
      });
    });

    describe('ignore patterns', () => {
      test('It should ignore specified directories', async () => {
        const files = await findFiles(TEST_DIR, ['**/*.js'], {
          ignore: ['node_modules/**']
        });

        expect(files).not.toContain('node_modules/lib.js');
      });

      test('It should ignore multiple patterns', async () => {
        const files = await findFiles(TEST_DIR, ['**/*.js'], {
          ignore: ['node_modules/**', 'dist/**']
        });

        expect(files).not.toContain('node_modules/lib.js');
        expect(files).not.toContain('dist/index.js');
      });

      test('It should ignore files by extension pattern', async () => {
        const files = await findFiles(TEST_DIR, ['**/*'], {
          ignore: ['*.json']
        });

        expect(files).not.toContain('package.json');
        expect(files).not.toContain('package-lock.json');
        expect(files).not.toContain('tsconfig.json');
      });

      test('It should respect ignore patterns with wildcards', async () => {
        const files = await findFiles(TEST_DIR, ['**/*'], {
          ignore: ['**/*.json', 'dist/**']
        });

        expect(files).not.toContain('package.json');
        expect(files).not.toContain('dist/index.js');
        expect(files).toContain('README.md');
      });
    });

    describe('dot files', () => {
      test('It should include dot files by default', async () => {
        const files = await findFiles(TEST_DIR, ['.gitignore']);

        expect(files).toHaveLength(1);
        expect(files[0]).toBe('.gitignore');
      });

      test('It should find files in dot directories', async () => {
        const files = await findFiles(TEST_DIR, ['.config/*.yml']);

        expect(files).toHaveLength(1);
        expect(files[0]).toBe('.config/settings.yml');
      });
    });

    describe('multiple patterns', () => {
      test('It should match files from multiple patterns', async () => {
        const files = await findFiles(TEST_DIR, ['*.json', '*.md']);

        expect(files.length).toBeGreaterThanOrEqual(4);
        expect(files).toContain('package.json');
        expect(files).toContain('package-lock.json');
        expect(files).toContain('tsconfig.json');
        expect(files).toContain('README.md');
      });

      test('It should deduplicate files matching multiple patterns', async () => {
        const files = await findFiles(TEST_DIR, [
          'package.json',
          '*.json',
          'package.json'
        ]);

        // Should only contain package.json once
        const packageJsonCount = files.filter(
          (f) => f === 'package.json'
        ).length;
        expect(packageJsonCount).toBe(1);
      });
    });

    describe('edge cases', () => {
      test('It should handle empty pattern array', async () => {
        const files = await findFiles(TEST_DIR, []);

        expect(files).toHaveLength(0);
      });

      test('It should handle non-existent directory gracefully', async () => {
        const nonExistentDir = path.join(TEST_DIR, 'non-existent');
        const files = await findFiles(nonExistentDir, ['*.json']);

        expect(files).toHaveLength(0);
      });

      test('It should respect maxDepth option', async () => {
        const files = await findFiles(TEST_DIR, ['**/*.ts'], { maxDepth: 0 });

        // Should only find files at root level (depth 0), not in subdirectories
        expect(files).not.toContain('src/index.ts');
        expect(files).not.toContain('src/utils/helper.ts');
      });

      test('It should handle patterns with special regex characters', async () => {
        // Create a file with special characters
        await fs.writeFile(path.join(TEST_DIR, 'file.test.js'), 'export {}');

        const files = await findFiles(TEST_DIR, ['*.test.js']);

        expect(files).toContain('file.test.js');

        // Clean up
        await fs.unlink(path.join(TEST_DIR, 'file.test.js'));
      });

      test('It should return sorted results', async () => {
        const files = await findFiles(TEST_DIR, ['*.json']);

        // Check if array is sorted
        const sorted = [...files].sort();
        expect(files).toEqual(sorted);
      });
    });

    describe('complex real-world patterns', () => {
      test('It should match package manager files', async () => {
        const files = await findFiles(TEST_DIR, [
          'package.json',
          'package-lock.json',
          'yarn.lock',
          'pnpm-lock.yaml'
        ]);

        expect(files).toContain('package.json');
        expect(files).toContain('package-lock.json');
      });

      test('It should match source files excluding build artifacts', async () => {
        const files = await findFiles(TEST_DIR, ['src/**/*.ts'], {
          ignore: ['dist/**', 'build/**', 'node_modules/**']
        });

        expect(files).toContain('src/index.ts');
        expect(files).toContain('src/app.ts');
        expect(files).toContain('src/utils/helper.ts');
        expect(files).not.toContain('dist/index.js');
      });

      test('It should match configuration files at root', async () => {
        const files = await findFiles(TEST_DIR, [
          '*.json',
          '*.yaml',
          '*.yml',
          '.gitignore'
        ]);

        expect(files).toContain('package.json');
        expect(files).toContain('tsconfig.json');
        expect(files).toContain('.gitignore');
      });
    });
  });
});

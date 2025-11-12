import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov'],
      include: ['src/*.ts'],
      exclude: ['**/node_modules/**']
    },
    include: ['tests/*.ts']
  }
});

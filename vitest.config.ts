import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./apps/jshsus/src/test/setup.ts'],
  },
});

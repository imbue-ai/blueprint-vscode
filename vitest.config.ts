import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/components/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/components/setup.ts'],
    globals: false,
  },
  esbuild: {
    jsx: 'automatic',
  },
});

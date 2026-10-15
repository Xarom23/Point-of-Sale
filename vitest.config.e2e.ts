import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Every file boots the app against the same database.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 15_000,
  },
});

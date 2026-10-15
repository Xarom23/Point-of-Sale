import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Own database: the suites truncate tables, the dev seed stays intact.
    globalSetup: './test/global-setup.ts',
    env: { DB_NAME: 'pos_test' },
    // Every file boots the app against the same database.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 15_000,
  },
});

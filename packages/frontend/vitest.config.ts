import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Component tests only. The `*.test.ts` files in `src/**` belong to the node:test lane and the
 * `src/__e2e__` directory belongs to Playwright; vitest must not collect either, or it runs
 * Playwright specs outside a browser and reports failures that have nothing to do with the code.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.tsx'],
    setupFiles: ['./src/test/setup.ts'],
  },
});

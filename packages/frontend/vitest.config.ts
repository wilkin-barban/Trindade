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
    // No pool override, deliberately. `pool: 'vmThreads'` was an attempt to make the `jsdom was created 25 times`
    // warning go away, and the re-audit found it breaking the whole suite on another machine before it ever
    // helped here: an environment that is shared to save a warning is an environment that leaks React state
    // between files. The default pool isolates each file in its own process, which is what a component suite
    // needs; the warning is the price of that and it is the honest one.
  },
});

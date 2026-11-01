import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library cleans up after each test only when the runner exposes globals; this lane does not,
// so the unmount is explicit and every test starts from an empty document.
afterEach(() => {
  cleanup();
});

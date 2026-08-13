import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Explicit rather than relying on @testing-library/react's auto-cleanup,
// which detects a global `afterEach` — we don't enable vitest's `globals`
// option, so without this, DOM from one test leaks into the next.
afterEach(() => {
  cleanup();
});

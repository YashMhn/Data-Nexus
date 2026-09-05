import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// The default 1s findBy/waitFor timeout is enough locally but can lose a race
// on a loaded CI runner, where these fetch-driven assertions turn flaky.
configure({ asyncUtilTimeout: 5000 });

// recharts measures its container; jsdom reports every element as 0x0, which
// makes ResponsiveContainer render nothing. Give it a real size.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

for (const [property, value] of [
  ['offsetWidth', 800],
  ['offsetHeight', 400],
  ['clientWidth', 800],
  ['clientHeight', 400],
] as const) {
  Object.defineProperty(HTMLElement.prototype, property, {
    configurable: true,
    value,
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

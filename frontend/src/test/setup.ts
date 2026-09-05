import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

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

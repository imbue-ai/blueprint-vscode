import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { type Mock } from 'vitest';

/**
 * Render a webview component and expose the mocked postMessage spy installed by setup.ts.
 * Use the returned `postMessage` mock to assert which messages a component dispatches.
 */
export function renderComponent(ui: ReactElement, options?: RenderOptions): RenderResult & { postMessage: Mock } {
  const result = render(ui, options);
  const postMessage = (globalThis as unknown as { __vsCodePostMessage: Mock }).__vsCodePostMessage;
  postMessage.mockClear();
  return Object.assign(result, { postMessage });
}

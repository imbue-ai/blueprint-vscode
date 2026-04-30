import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import type { ComponentType, PropsWithChildren } from 'react';
import { createElement } from 'react';
import { afterEach, vi } from 'vitest';

// Auto-unmount and clear the DOM between tests so previous renders don't leak.
afterEach(() => {
  cleanup();
});

// `useVSCodeMessaging.ts` calls `acquireVsCodeApi()` at module load time.
// Install a stub on the global before any component module is imported.
const postMessage = vi.fn();
const getState = vi.fn(() => undefined);
const setState = vi.fn();

(globalThis as unknown as { acquireVsCodeApi: () => unknown }).acquireVsCodeApi = () => ({
  postMessage,
  getState,
  setState,
});

// Expose the spy so tests can import it.
(globalThis as unknown as { __vsCodePostMessage: ReturnType<typeof vi.fn> }).__vsCodePostMessage = postMessage;

// `@vscode-elements/react-elements` wraps Lit-based custom elements that need browser APIs
// (ElementInternals, customElements registration) which happy-dom doesn't implement.
// Stub each used component to a plain HTML element so RTL can interact with it normally.
// Custom elements render with a kebab-case tag (e.g. `vscode-button`) so existing
// querySelector(`vscode-button[disabled]`) calls in tests still work.
function makeStub(tag: string): ComponentType<PropsWithChildren<Record<string, unknown>>> {
  // React serializes boolean props on lowercase tags as string attributes — `disabled={false}`
  // becomes `disabled="false"`, which still matches `[disabled]` queries. Filter falsy props
  // so attribute presence reflects truthiness, matching real HTML behavior.
  const Stub = ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
      if (v === false || v === undefined || v === null) continue;
      cleaned[k] = v;
    }
    return createElement(tag, cleaned, children);
  };
  Stub.displayName = `Stub(${tag})`;
  return Stub;
}

vi.mock('@vscode-elements/react-elements', () => ({
  VscodeButton: makeStub('vscode-button'),
  VscodeTextarea: makeStub('vscode-textarea'),
  VscodeTextfield: makeStub('vscode-textfield'),
  VscodeRadio: makeStub('vscode-radio'),
  VscodeRadioGroup: makeStub('vscode-radio-group'),
  VscodeCheckbox: makeStub('vscode-checkbox'),
  VscodeFormHelper: makeStub('vscode-form-helper'),
  VscodeIcon: makeStub('vscode-icon'),
  VscodeLabel: makeStub('vscode-label'),
  VscodeDivider: makeStub('vscode-divider'),
  VscodeContextMenu: makeStub('vscode-context-menu'),
  VscodeContextMenuItem: makeStub('vscode-context-menu-item'),
  VscodeProgressRing: makeStub('vscode-progress-ring'),
  VscodeBadge: makeStub('vscode-badge'),
  VscodeCollapsible: makeStub('vscode-collapsible'),
  VscodeScrollable: makeStub('vscode-scrollable'),
  VscodeOption: makeStub('vscode-option'),
  VscodeMultiSelect: makeStub('vscode-multi-select'),
  VscodeSingleSelect: makeStub('vscode-single-select'),
  VscodeTabs: makeStub('vscode-tabs'),
  VscodeTabHeader: makeStub('vscode-tab-header'),
  VscodeTabPanel: makeStub('vscode-tab-panel'),
  VscodeTree: makeStub('vscode-tree'),
}));

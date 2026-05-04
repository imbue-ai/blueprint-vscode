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

// Native form-control stubs for radio/checkbox. React's `onChange` only fires on a real `change`
// event for native inputs — on lowercase custom elements it's just an attribute, so a synthetic
// `fireEvent.change` doesn't reach the handler. Rendering these as native `<input>` lets tests
// use `fireEvent.change(...)` (or `fireEvent.click` for an actual radio/checkbox) and have it
// trigger the React onChange handler the component installed.
function makeInputStub(type: 'radio' | 'checkbox'): ComponentType<PropsWithChildren<Record<string, unknown>>> {
  const Stub = ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => {
    const cleaned: Record<string, unknown> = { type, 'data-stub-tag': `vscode-${type}` };
    for (const [k, v] of Object.entries(props)) {
      if (v === false || v === undefined || v === null) continue;
      cleaned[k] = v;
    }
    // <input> is a void element — wrap in a <label> so the choice text (passed as children) still
    // renders alongside it. Tests can find the input via `input[type="radio"]` and the label text
    // via the wrapping label.
    return createElement('label', null, createElement('input', cleaned), ' ', children);
  };
  Stub.displayName = `InputStub(${type})`;
  return Stub;
}

// `webview/components/InputComponents.ts` builds Lit-based custom elements at import time
// (`customElements.define`), which fails in happy-dom for the same ElementInternals reason.
// Stub them to native HTML inputs so happy-dom and RTL handle them normally.
vi.mock('../../src/webview/components/InputComponents', () => {
  // Textfield rendered as `<input type="text">` so tests can disambiguate it from radio/checkbox
  // inputs via `input[type="text"]`.
  const TextfieldStub = ({ children: _, ...props }: PropsWithChildren<Record<string, unknown>>) => {
    const cleaned: Record<string, unknown> = { type: 'text' };
    for (const [k, v] of Object.entries(props)) {
      if (v === false || v === undefined || v === null) continue;
      cleaned[k] = v;
    }
    return createElement('input', cleaned);
  };
  return {
    Textarea: makeStub('textarea'),
    Textfield: TextfieldStub,
  };
});

vi.mock('@vscode-elements/react-elements', () => ({
  VscodeButton: makeStub('vscode-button'),
  VscodeTextarea: makeStub('vscode-textarea'),
  VscodeTextfield: makeStub('vscode-textfield'),
  VscodeRadio: makeInputStub('radio'),
  VscodeRadioGroup: makeStub('vscode-radio-group'),
  VscodeCheckbox: makeInputStub('checkbox'),
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

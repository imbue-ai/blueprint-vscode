/**
 * Component tests for `TemplateEditorScreen` — the form for creating or editing a template.
 *
 * Layer: component (Vitest + RTL + happy-dom).
 * Scope: title flips with `isCreate`; Save button label flips with `isCreate`; Save enable rules
 *   (name + filename + .md ext + structured-mode-needs-sections); Save click dispatches
 *   `saveTemplateEditor`; mode toggle (Structured / Freeform) dispatches `setTemplateEditorMode`.
 * Out of scope: `TemplateEditorNameFields` input dispatch (delegated; covered indirectly via the
 *   backend tests); section CRUD UI inside `ContentGroupBody`/`StyleGroupBody` (covered by
 *   `TemplateFormFields.unit.test.ts`); the TemplateEditorView backend (own integration test).
 */
import { fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { AppScreen } from '../../../src/types/screens';
import { TemplateEditorScreen } from '../../../src/webview/screens/TemplateEditorScreen';
import { renderComponent } from '../helpers/render';

type TemplateEditorScreenData = Extract<AppScreen, { type: 'templateEditor' }>;

function makeScreen(overrides: Partial<TemplateEditorScreenData> = {}): TemplateEditorScreenData {
  return {
    type: 'templateEditor',
    name: 'My plan',
    filename: 'plan.md',
    mode: 'structured',
    rawPrompt: '',
    isCreate: true,
    data: {
      sections: [{ id: 's1', title: 'Overview', description: 'desc' }],
      styles: ['bullet'],
      depth: 'concise',
      notes: '',
    },
    ...overrides,
  };
}

const saveButton = () =>
  Array.from(document.querySelectorAll('vscode-button')).find((b) =>
    /(Create template|Save template)/.test(b.textContent ?? ''),
  ) as HTMLElement | undefined;

describe('TemplateEditorScreen — title + save label', () => {
  /**
   * Goal: when `isCreate` is true, the title reads "New template" and the Save button reads
   *   "Create template". Pins the new-template UX so users see they're starting fresh.
   * Process: render with `isCreate: true`; assert both labels.
   */
  it('renders "New template" and "Create template" when isCreate is true', () => {
    renderComponent(<TemplateEditorScreen screen={makeScreen({ isCreate: true })} />);
    expect(document.body.textContent).toContain('New template');
    expect(saveButton()?.textContent).toContain('Create template');
  });

  /**
   * Goal: when `isCreate` is false, the title reads "Edit template" and the Save button reads
   *   "Save template". Pins the edit-existing UX.
   * Process: render with `isCreate: false`; assert both labels.
   */
  it('renders "Edit template" and "Save template" when isCreate is false', () => {
    renderComponent(<TemplateEditorScreen screen={makeScreen({ isCreate: false })} />);
    expect(document.body.textContent).toContain('Edit template');
    expect(saveButton()?.textContent).toContain('Save template');
  });
});

describe('TemplateEditorScreen — Save button enable rules', () => {
  /**
   * Goal: Save is disabled when the name is empty (or whitespace-only). Pins the gate that
   *   prevents nameless template saves at the UI layer (the backend also rejects, but this stops
   *   the click from firing).
   * Process: render with empty name; assert disabled.
   */
  it('is disabled when name is empty', () => {
    renderComponent(<TemplateEditorScreen screen={makeScreen({ name: '' })} />);
    expect(saveButton()?.hasAttribute('disabled')).toBe(true);
  });

  /**
   * Goal: Save is disabled when the filename is empty. Mirrors the name gate.
   * Process: render with empty filename; assert disabled.
   */
  it('is disabled when filename is empty', () => {
    renderComponent(<TemplateEditorScreen screen={makeScreen({ filename: '' })} />);
    expect(saveButton()?.hasAttribute('disabled')).toBe(true);
  });

  /**
   * Goal: Save is disabled when the filename does not end with `.md` — agents only read .md
   *   spec files, so a non-.md name would silently break the planning flow. Pins the suffix
   *   check that mirrors the validation in `TemplateEditorNameFields`.
   * Process: render with filename `plan.txt`; assert disabled.
   */
  it('is disabled when the filename does not end with .md', () => {
    renderComponent(<TemplateEditorScreen screen={makeScreen({ filename: 'plan.txt' })} />);
    expect(saveButton()?.hasAttribute('disabled')).toBe(true);
  });

  /**
   * Goal: in structured mode, Save is disabled when there are no sections — a structured
   *   template needs at least one section to render anything useful. Pins the structured-mode
   *   gate.
   * Process: render with `mode: 'structured'` + empty sections; assert disabled.
   */
  it('is disabled in structured mode when there are no sections', () => {
    renderComponent(
      <TemplateEditorScreen
        screen={makeScreen({
          mode: 'structured',
          data: {
            sections: [],
            styles: ['bullet'],
            depth: 'concise',
            notes: '',
          },
        })}
      />,
    );
    expect(saveButton()?.hasAttribute('disabled')).toBe(true);
  });

  /**
   * Goal: in freeform mode, sections are not required — the user provides a raw prompt instead.
   *   Pins that the structured-mode gate doesn't leak into freeform.
   * Process: render with `mode: 'freeform'` + empty sections; assert enabled (other fields ok).
   */
  it('is enabled in freeform mode even when sections are empty', () => {
    renderComponent(
      <TemplateEditorScreen
        screen={makeScreen({
          mode: 'freeform',
          rawPrompt: 'do the thing',
          data: {
            sections: [],
            styles: ['bullet'],
            depth: 'concise',
            notes: '',
          },
        })}
      />,
    );
    expect(saveButton()?.hasAttribute('disabled')).toBe(false);
  });

  /**
   * Goal: with all gates satisfied, Save is enabled. Pins the inverse case so the disabled
   *   tests don't false-pass with a permanently-disabled button.
   * Process: render with default screen (all valid); assert enabled.
   */
  it('is enabled when name + .md filename + sections are all valid', () => {
    renderComponent(<TemplateEditorScreen screen={makeScreen()} />);
    expect(saveButton()?.hasAttribute('disabled')).toBe(false);
  });
});

describe('TemplateEditorScreen — Save click', () => {
  /**
   * Goal: clicking Save (when enabled) dispatches `saveTemplateEditor`. Pins the only path from
   *   this button to the backend — the backend then writes config and closes the view.
   * Process: render with valid screen; click; assert dispatch.
   */
  it('clicking Save dispatches saveTemplateEditor', () => {
    const { postMessage } = renderComponent(<TemplateEditorScreen screen={makeScreen()} />);
    fireEvent.click(saveButton()!);
    expect(postMessage).toHaveBeenCalledWith({ type: 'saveTemplateEditor' });
  });
});

describe('TemplateEditorScreen — mode toggle', () => {
  /**
   * Goal: clicking the Freeform tab while in Structured mode dispatches
   *   `setTemplateEditorMode` with `'freeform'`. Pins the only path to switch modes.
   * Process: render with `mode: 'structured'`; find and click the Freeform button; assert
   *   dispatch.
   */
  it('clicking Freeform dispatches setTemplateEditorMode', () => {
    const { postMessage } = renderComponent(<TemplateEditorScreen screen={makeScreen({ mode: 'structured' })} />);
    const freeformBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Freeform',
    ) as HTMLButtonElement;
    fireEvent.click(freeformBtn);
    expect(postMessage).toHaveBeenCalledWith({ type: 'setTemplateEditorMode', mode: 'freeform' });
  });

  /**
   * Goal: clicking the Structured tab while in Freeform mode dispatches
   *   `setTemplateEditorMode` with `'structured'`. Symmetric to the freeform case.
   * Process: render with `mode: 'freeform'`; click Structured; assert dispatch.
   */
  it('clicking Structured dispatches setTemplateEditorMode', () => {
    const { postMessage } = renderComponent(<TemplateEditorScreen screen={makeScreen({ mode: 'freeform' })} />);
    const structuredBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Structured',
    ) as HTMLButtonElement;
    fireEvent.click(structuredBtn);
    expect(postMessage).toHaveBeenCalledWith({ type: 'setTemplateEditorMode', mode: 'structured' });
  });
});

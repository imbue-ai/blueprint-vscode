/**
 * Component tests for `PromptScreen` — the screen the user lands on after onboarding, where
 * they describe what they want to build before submitting to the questioning agent.
 *
 * Layer: component (Vitest + RTL + happy-dom). Renders the React component in isolation;
 *   mocks the VS Code messaging bridge and the Lit-based input components.
 * Scope: front-end validation and message dispatch — Submit button enable/disable based on
 *   prompt content, click and keyboard shortcut both posting `submitSpecPrompt`, and typing
 *   in the textarea posting `setPrompt`.
 * Out of scope: what happens after submission (covered by `tests/workflows/submit-prompt.test.ts`
 *   which exercises the questioning agent flow); the textarea auto-grow behavior (UI polish,
 *   not a contract).
 */
import { fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { AppScreen } from '../../../src/types/screens';
import { PromptScreen } from '../../../src/webview/screens/PromptScreen';
import { renderComponent } from '../helpers/render';

type PromptScreenData = Extract<AppScreen, { type: 'prompt' }>;

const makeScreen = (prompt = ''): PromptScreenData => ({ type: 'prompt', prompt });

const getSubmitButton = () => document.querySelector('vscode-button') as HTMLElement | null;
const getTextarea = () => document.querySelector('textarea') as HTMLTextAreaElement | null;

describe('PromptScreen — Submit button enable/disable', () => {
  /**
   * Goal: empty prompt blocks submission. The Submit button is the only path to dispatch
   *   `submitSpecPrompt` from the UI; if the disable prop drops, users can fire empty prompts.
   * Process: render with `prompt: ''`; assert the button has `disabled`.
   */
  it('is disabled when prompt is empty', () => {
    renderComponent(<PromptScreen screen={makeScreen('')} />);
    expect(getSubmitButton()?.hasAttribute('disabled')).toBe(true);
  });

  /**
   * Goal: whitespace-only prompts are treated identically to empty (uses `.trim()` on the
   *   `canSubmit` derivation). Pins that "   " or "\t\n" doesn't slip past the gate.
   * Process: for each whitespace input, render and assert the button is disabled.
   */
  it('is disabled when prompt is whitespace-only', () => {
    for (const prompt of ['   ', '\t', '\n', '  \t\n  ']) {
      renderComponent(<PromptScreen screen={makeScreen(prompt)} />);
      expect(getSubmitButton()?.hasAttribute('disabled')).toBe(true);
    }
  });

  /**
   * Goal: a prompt with non-whitespace content enables the button. The inverse of the disabled
   *   tests — pins that valid input flips the gate.
   * Process: render with a real prompt; assert the button does NOT have `disabled`.
   */
  it('is enabled when prompt has non-whitespace content', () => {
    renderComponent(<PromptScreen screen={makeScreen('Add a profile API')} />);
    expect(getSubmitButton()?.hasAttribute('disabled')).toBe(false);
  });
});

describe('PromptScreen — message dispatch', () => {
  /**
   * Goal: clicking Submit (when enabled) posts `submitSpecPrompt` — the only message the screen
   *   sends to start the questioning flow. Catches a regression where the click handler is
   *   removed or the message shape changes.
   * Process: render with a valid prompt; click the button; assert `postMessage` got called with
   *   exactly `{ type: 'submitSpecPrompt' }`.
   */
  it('clicking Submit posts submitSpecPrompt', () => {
    const { postMessage } = renderComponent(<PromptScreen screen={makeScreen('Build a thing')} />);
    fireEvent.click(getSubmitButton()!);
    expect(postMessage).toHaveBeenCalledWith({ type: 'submitSpecPrompt' });
  });

  /**
   * Goal: Cmd+Enter / Ctrl+Enter on the textarea posts `submitSpecPrompt` when the prompt is
   *   valid. Pins the keyboard shortcut as a parallel path to the button click — power users
   *   rely on it.
   * Process: render with a valid prompt; fire keydown with `metaKey: true, key: 'Enter'` on the
   *   textarea; assert `submitSpecPrompt` was dispatched.
   */
  it('Cmd+Enter on the textarea posts submitSpecPrompt when prompt is valid', () => {
    const { postMessage } = renderComponent(<PromptScreen screen={makeScreen('Build a thing')} />);
    fireEvent.keyDown(getTextarea()!, { key: 'Enter', metaKey: true });
    const submits = postMessage.mock.calls.filter(([m]) => (m as { type: string }).type === 'submitSpecPrompt');
    expect(submits).toHaveLength(1);
  });

  /**
   * Goal: Cmd+Enter does NOT post when the prompt is empty/whitespace — the keyboard path uses
   *   the same `canSubmit` gate as the button. Pins symmetry between the two dispatch paths.
   * Process: render with an empty prompt; fire Cmd+Enter; assert no `submitSpecPrompt` was
   *   dispatched.
   */
  it('Cmd+Enter does nothing when prompt is empty', () => {
    const { postMessage } = renderComponent(<PromptScreen screen={makeScreen('')} />);
    fireEvent.keyDown(getTextarea()!, { key: 'Enter', metaKey: true });
    const submits = postMessage.mock.calls.filter(([m]) => (m as { type: string }).type === 'submitSpecPrompt');
    expect(submits).toHaveLength(0);
  });

  /**
   * Goal: typing in the textarea posts `setPrompt` so the host stays in sync with what the user
   *   sees. Pins the input → host data flow; without it, submission would send a stale prompt.
   * Process: render; fire an `input` event on the textarea with new value; assert `setPrompt`
   *   was dispatched with that value.
   */
  it('typing in the textarea posts setPrompt with the new value', () => {
    const { postMessage } = renderComponent(<PromptScreen screen={makeScreen('')} />);
    const ta = getTextarea()!;
    ta.value = 'Add a feature';
    fireEvent.input(ta);
    expect(postMessage).toHaveBeenCalledWith({ type: 'setPrompt', prompt: 'Add a feature' });
  });

  /**
   * Goal: the textarea renders the current prompt value from props (controlled component
   *   pattern). Pins that switching screens / restoring state from the host shows the right text.
   * Process: render with a non-empty prompt; assert the textarea's value matches.
   */
  it('renders the current prompt value in the textarea', () => {
    renderComponent(<PromptScreen screen={makeScreen('Existing draft')} />);
    expect(getTextarea()?.value).toBe('Existing draft');
  });

  /**
   * Goal: a placeholder/tip text appears, guiding first-time users on what to type. Pins that
   *   the placeholder isn't accidentally removed (would degrade UX silently).
   * Process: render with empty prompt; assert the textarea's placeholder is the expected text.
   */
  it('shows a placeholder describing what to type', () => {
    renderComponent(<PromptScreen screen={makeScreen('')} />);
    expect(getTextarea()?.placeholder).toMatch(/describe what you want to build/i);
  });
});

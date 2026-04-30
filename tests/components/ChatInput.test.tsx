/**
 * Component tests for `ChatInput` — the chat-tab textarea + Send button used during plan editing.
 *
 * Layer: component (Vitest + RTL + happy-dom).
 * Scope: enable/disable logic for the Send button, click and Cmd+Enter dispatch, and the input
 *   → host data flow via `setDraftMessage`.
 * Out of scope: the surrounding spec-editing screen (covered when its component test lands);
 *   the editor-state machine that consumes `sendMessage` (covered in
 *   `tests/editor/editorReady.unit.test.ts`).
 */
import { fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ChatInput } from '../../src/webview/components/ChatInput';
import { renderComponent } from './helpers/render';

const getButton = () => document.querySelector('vscode-button') as HTMLElement | null;
const getTextarea = () => document.querySelector('textarea') as HTMLTextAreaElement | null;

describe('ChatInput — Send button enable/disable', () => {
  /**
   * Goal: empty draft disables the Send button. Pins the gate that prevents users from sending
   *   empty messages to the editor agent.
   * Process: render with `draft: ''`; assert the button is disabled.
   */
  it('is disabled when draft is empty', () => {
    renderComponent(<ChatInput draft="" disabled={false} />);
    expect(getButton()?.hasAttribute('disabled')).toBe(true);
  });

  /**
   * Goal: whitespace-only drafts are also rejected (uses `.trim()`). Pins the same gate as
   *   the prompt screen — submitted content must be meaningful.
   * Process: render with whitespace; assert disabled.
   */
  it('is disabled when draft is whitespace-only', () => {
    renderComponent(<ChatInput draft={'   \n\t'} disabled={false} />);
    expect(getButton()?.hasAttribute('disabled')).toBe(true);
  });

  /**
   * Goal: even with a non-empty draft, the Send button is disabled when the parent passes
   *   `disabled={true}` — typically because the editor agent is currently working. Pins that
   *   the parent's gate is honored.
   * Process: render with content + `disabled: true`; assert disabled.
   */
  it('is disabled when the parent passes disabled=true', () => {
    renderComponent(<ChatInput draft="Refine the API section" disabled={true} />);
    expect(getButton()?.hasAttribute('disabled')).toBe(true);
  });

  /**
   * Goal: with content and not disabled by parent, the Send button is enabled. Pins the
   *   inverse case.
   * Process: render with content + `disabled: false`; assert enabled.
   */
  it('is enabled when draft has content and parent does not disable', () => {
    renderComponent(<ChatInput draft="Refine the API section" disabled={false} />);
    expect(getButton()?.hasAttribute('disabled')).toBe(false);
  });
});

describe('ChatInput — message dispatch', () => {
  /**
   * Goal: clicking Send (when enabled) posts `sendMessage`. Pins the only path from this
   *   component to the host's chat handler.
   * Process: render with content; click; assert `sendMessage` was dispatched.
   */
  it('clicking Send posts sendMessage when enabled', () => {
    const { postMessage } = renderComponent(<ChatInput draft="Hi there" disabled={false} />);
    fireEvent.click(getButton()!);
    expect(postMessage).toHaveBeenCalledWith({ type: 'sendMessage' });
  });

  /**
   * Goal: clicking Send while disabled does NOT post `sendMessage`. Pins that the click handler
   *   short-circuits when `canSend` is false.
   * Process: render with content + `disabled: true`; click; assert no dispatch.
   */
  it('clicking Send while disabled does not post', () => {
    const { postMessage } = renderComponent(<ChatInput draft="Hi" disabled={true} />);
    fireEvent.click(getButton()!);
    const sends = postMessage.mock.calls.filter(([m]) => (m as { type: string }).type === 'sendMessage');
    expect(sends).toHaveLength(0);
  });

  /**
   * Goal: Cmd+Enter / Ctrl+Enter on the textarea posts `sendMessage` when enabled. Pins the
   *   keyboard shortcut as a parallel path to the click.
   * Process: render with content; fire keydown with `metaKey + Enter`; assert dispatch.
   */
  it('Cmd+Enter on the textarea posts sendMessage when enabled', () => {
    const { postMessage } = renderComponent(<ChatInput draft="Hi" disabled={false} />);
    fireEvent.keyDown(getTextarea()!, { key: 'Enter', metaKey: true });
    const sends = postMessage.mock.calls.filter(([m]) => (m as { type: string }).type === 'sendMessage');
    expect(sends).toHaveLength(1);
  });

  /**
   * Goal: Cmd+Enter while disabled does NOT post. Pins symmetry with the button — both paths
   *   share the same `canSend` gate.
   * Process: render with disabled; fire Cmd+Enter; assert no dispatch.
   */
  it('Cmd+Enter while disabled does not post', () => {
    const { postMessage } = renderComponent(<ChatInput draft="Hi" disabled={true} />);
    fireEvent.keyDown(getTextarea()!, { key: 'Enter', metaKey: true });
    const sends = postMessage.mock.calls.filter(([m]) => (m as { type: string }).type === 'sendMessage');
    expect(sends).toHaveLength(0);
  });

  /**
   * Goal: typing in the textarea posts `setDraftMessage` so the host stays in sync. Pins the
   *   input → host data flow.
   * Process: render; fire `input` on the textarea with new value; assert dispatch.
   */
  it('typing in the textarea posts setDraftMessage with the new value', () => {
    const { postMessage } = renderComponent(<ChatInput draft="" disabled={false} />);
    const ta = getTextarea()!;
    ta.value = 'Refine the API';
    fireEvent.input(ta);
    expect(postMessage).toHaveBeenCalledWith({ type: 'setDraftMessage', message: 'Refine the API' });
  });
});

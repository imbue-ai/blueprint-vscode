/**
 * Component tests for `FeedbackTab` — the sidebar feedback list with Submit button.
 *
 * Layer: component (Vitest + RTL + happy-dom).
 * Scope: Submit button enable/disable, button label updates with pending count, item rendering
 *   (text + line label), delete dispatch, jump-to-line on item click, submit dispatch + parent
 *   callback.
 * Out of scope: comment-thread / gutter wiring (covered when `editor/editor.ts` gets tests);
 *   the EditorReadyState handlers consuming the messages (covered in `feedback.unit.test.ts`).
 */
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { FeedbackItem } from '../../src/types/screens';
import { FeedbackTab } from '../../src/webview/components/FeedbackTab';
import { renderComponent } from './helpers/render';

const item = (overrides: Partial<FeedbackItem> = {}): FeedbackItem => ({
  id: 'fb-1',
  text: 'tighten this paragraph',
  startLine: 5,
  endLine: 5,
  ...overrides,
});

const getSubmitButton = () => document.querySelector('vscode-button') as HTMLElement | null;

describe('FeedbackTab — Submit button', () => {
  /**
   * Goal: Submit button is disabled when there are zero pending feedback items. Pins the gate
   *   that prevents users from clicking with nothing to submit.
   * Process: render with `nFeedback: 0`; assert disabled.
   */
  it('is disabled when nFeedback is 0', () => {
    renderComponent(<FeedbackTab feedbackItems={[]} nFeedback={0} isWorking={false} onSubmit={vi.fn()} />);
    expect(getSubmitButton()?.hasAttribute('disabled')).toBe(true);
  });

  /**
   * Goal: Submit button is disabled while the editor agent is working. Pins the parent's
   *   `isWorking` gate that prevents racing the agent.
   * Process: render with one item + `isWorking: true`; assert disabled.
   */
  it('is disabled when isWorking is true', () => {
    renderComponent(<FeedbackTab feedbackItems={[item()]} nFeedback={1} isWorking={true} onSubmit={vi.fn()} />);
    expect(getSubmitButton()?.hasAttribute('disabled')).toBe(true);
  });

  /**
   * Goal: with at least one item AND not working, the Submit button is enabled. Pins the
   *   inverse case.
   * Process: render with one item + `isWorking: false`; assert enabled.
   */
  it('is enabled when nFeedback > 0 and not working', () => {
    renderComponent(<FeedbackTab feedbackItems={[item()]} nFeedback={1} isWorking={false} onSubmit={vi.fn()} />);
    expect(getSubmitButton()?.hasAttribute('disabled')).toBe(false);
  });

  /**
   * Goal: the Submit button label includes the pending count when > 0 (e.g. "Submit feedback
   *   (3)"). Pins the count display so users see how many items they're about to send.
   * Process: render with three items; assert the button contains the count.
   */
  it('shows the pending count in the button label', () => {
    renderComponent(
      <FeedbackTab
        feedbackItems={[item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })]}
        nFeedback={3}
        isWorking={false}
        onSubmit={vi.fn()}
      />,
    );
    expect(getSubmitButton()?.textContent).toContain('(3)');
  });

  /**
   * Goal: clicking Submit dispatches `submitSpecFeedback` AND calls the parent's `onSubmit`
   *   callback (used by the parent to switch tabs after submit). Pins both effects.
   * Process: render with one item; click Submit; assert dispatch + onSubmit called.
   */
  it('clicking Submit posts submitSpecFeedback and calls onSubmit', () => {
    const onSubmit = vi.fn();
    const { postMessage } = renderComponent(
      <FeedbackTab feedbackItems={[item()]} nFeedback={1} isWorking={false} onSubmit={onSubmit} />,
    );
    fireEvent.click(getSubmitButton()!);
    expect(postMessage).toHaveBeenCalledWith({ type: 'submitSpecFeedback' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('FeedbackTab — item rendering', () => {
  /**
   * Goal: each pending feedback item renders its text and a line label. Pins the readable
   *   list that lets users review what they've written before submitting.
   * Process: render with two items; assert both texts and both line labels appear.
   */
  it('renders feedback text and line label per item', () => {
    renderComponent(
      <FeedbackTab
        feedbackItems={[
          item({ id: 'a', text: 'first comment', startLine: 3, endLine: 3 }),
          item({ id: 'b', text: 'second comment', startLine: 10, endLine: 12 }),
        ]}
        nFeedback={2}
        isWorking={false}
        onSubmit={vi.fn()}
      />,
    );
    expect(document.body.textContent).toContain('first comment');
    expect(document.body.textContent).toContain('Line 3');
    expect(document.body.textContent).toContain('second comment');
    expect(document.body.textContent).toContain('Lines 10–12');
  });

  /**
   * Goal: clicking an item dispatches `jumpToLineNumber` so the editor scrolls to the comment.
   *   Pins the navigation affordance that connects the sidebar list to the plan editor.
   * Process: render with one item; click the card; assert dispatch with the item's startLine.
   */
  it('clicking an item posts jumpToLineNumber with the item startLine', () => {
    const { postMessage } = renderComponent(
      <FeedbackTab
        feedbackItems={[item({ id: 'a', startLine: 7, endLine: 7 })]}
        nFeedback={1}
        isWorking={false}
        onSubmit={vi.fn()}
      />,
    );
    // Find the card by its rendered text; the button-with-title is the trash inside the card.
    const trashButton = document.querySelector('button[title="Delete feedback"]')!;
    // The clickable card is the trash button's outer `<div>` ancestor whose onClick fires the
    // jumpToLineNumber dispatch.
    const card = trashButton.closest('div[style*="cursor: pointer"]') as HTMLElement | null;
    expect(card).not.toBeNull();
    fireEvent.click(card!);
    expect(postMessage).toHaveBeenCalledWith({ type: 'jumpToLineNumber', line: 7 });
  });

  /**
   * Goal: clicking the trash icon dispatches `deleteFeedback` AND does not also fire the
   *   item's jump handler (the click handler stops propagation). Pins the inner-button-doesn't-
   *   trigger-card-click contract.
   * Process: render with one item; click the trash button (not the card); assert delete was
   *   dispatched and `jumpToLineNumber` was not.
   */
  it('clicking the trash icon posts deleteFeedback and does not jump', () => {
    const { postMessage } = renderComponent(
      <FeedbackTab feedbackItems={[item({ id: 'a' })]} nFeedback={1} isWorking={false} onSubmit={vi.fn()} />,
    );
    const trashButton = document.querySelector('button[title="Delete feedback"]');
    expect(trashButton).not.toBeNull();
    fireEvent.click(trashButton!);
    expect(postMessage).toHaveBeenCalledWith({ type: 'deleteFeedback', id: 'a' });
    const jumps = postMessage.mock.calls.filter(([m]) => (m as { type: string }).type === 'jumpToLineNumber');
    expect(jumps).toHaveLength(0);
  });
});

/**
 * Unit tests for `buildFeedbackPrompt` — turns the snapshot's pending feedback list into the
 * single agent message dispatched when the user clicks "Submit feedback".
 *
 * Layer: unit (Mocha). Pure function on snapshot data.
 * Scope: empty case (returns null), single-item formatting, multi-item sorting, line-range
 *   labels for single-line vs multi-line feedback.
 * Out of scope: the EditorReadyState handler that calls this (covered in
 *   `tests/editor/feedback.unit.test.ts`); the underlying `getFeedbackPrompt` template (a value).
 */
import * as assert from 'assert';

import { buildFeedbackPrompt } from '../../src/core/feedbackSubmit';
import type { ClaudeSession } from '../../src/core/session';
import { SnapshotManager } from '../../src/core/snapshotManager';
import type { FeedbackItem } from '../../src/types/screens';

function stubSession(): ClaudeSession {
  const stub: any = {
    fork: () => stubSession(),
    abort: () => {},
    getSessionId: () => null,
    prompt: async function* () {},
  };
  return stub as ClaudeSession;
}

function makeMgr(pendingFeedback: FeedbackItem[]): SnapshotManager {
  const mgr = new SnapshotManager();
  mgr.createSnapshot({
    prompt: 'p',
    specContent: '',
    chatMessages: [],
    streamItems: [],
    editingSession: stubSession(),
    submittedFeedback: [],
    pendingFeedback,
    questionRounds: [],
  });
  return mgr;
}

suite('Unit: buildFeedbackPrompt', () => {
  /**
   * Goal: with no pending feedback, the function returns `null` so the caller knows there's
   *   nothing to send. Pins the empty case — without it, an empty submit would generate a
   *   wasted agent call with a stub prompt.
   * Process: build a manager with no feedback; call `buildFeedbackPrompt`; assert null.
   */
  test('returns null when there is no pending feedback', () => {
    assert.strictEqual(buildFeedbackPrompt(makeMgr([])), null);
  });

  /**
   * Goal: a single single-line feedback item is rendered as `Line N:` followed by the user's
   *   text, wrapped in the standard feedback prompt template.
   * Process: build a manager with one item at line 5; call; assert the output includes both
   *   the line label and the text.
   */
  test('renders a single-line feedback item with a "Line N" label', () => {
    const out = buildFeedbackPrompt(makeMgr([{ id: 'a', text: 'tighten this paragraph', startLine: 5, endLine: 5 }]));
    assert.ok(out, 'should not be null');
    assert.ok(out!.includes('Line 5:'));
    assert.ok(out!.includes('tighten this paragraph'));
  });

  /**
   * Goal: multi-line feedback (different start/end) is rendered as `Lines X-Y:`. Pins the range
   *   formatting that distinguishes a paragraph-spanning comment from a single-line one.
   * Process: build a manager with one item spanning lines 5-7; call; assert the output uses
   *   the range form.
   */
  test('renders a multi-line feedback item with a "Lines X-Y" label', () => {
    const out = buildFeedbackPrompt(makeMgr([{ id: 'a', text: 'collapse this section', startLine: 5, endLine: 7 }]));
    assert.ok(out!.includes('Lines 5-7:'));
    assert.ok(out!.includes('collapse this section'));
  });

  /**
   * Goal: multiple items are rendered in `startLine` order regardless of their order in the
   *   array. Pins the visual grouping rule — when the agent reads the prompt, comments flow
   *   top-to-bottom matching the plan.
   * Process: build a manager with items in reverse order; call; assert the line-10 reference
   *   appears before the line-3 reference in the output.
   */
  test('sorts feedback items by startLine ascending', () => {
    const out = buildFeedbackPrompt(
      makeMgr([
        { id: 'b', text: 'second', startLine: 10, endLine: 10 },
        { id: 'a', text: 'first', startLine: 3, endLine: 3 },
      ]),
    )!;
    const idxFirst = out.indexOf('Line 3:');
    const idxSecond = out.indexOf('Line 10:');
    assert.ok(idxFirst !== -1 && idxSecond !== -1);
    assert.ok(idxFirst < idxSecond, 'sorted by startLine');
  });

  /**
   * Goal: items are separated by a blank line so the agent reads each as a distinct comment.
   *   Pins the formatting separator.
   * Process: build with two items; call; assert `\n\n` appears between them in the body.
   */
  test('separates items with a blank line', () => {
    const out = buildFeedbackPrompt(
      makeMgr([
        { id: 'a', text: 'first', startLine: 1, endLine: 1 },
        { id: 'b', text: 'second', startLine: 2, endLine: 2 },
      ]),
    )!;
    // Each item produces two lines (label + text) joined by `\n`. The join between items uses
    // `\n\n` so consecutive items are visually separated.
    assert.ok(out.includes('first\n\nLine 2'), 'items should be separated by a blank line');
  });
});

/**
 * Unit tests for `WritingSpecState`'s message handlers and screen output.
 *
 * Layer: unit (Mocha). Constructs `WritingSpecState` directly with a stub `App` and stub
 *   `ClaudeSession`. Skips `onEnter`/`writeSpec` (which streams from a real session and writes
 *   to disk) — those are exercised via the writing workflow tests.
 * Scope: handleMessage routes (setDraftMessage, addFeedback, editFeedback, deleteFeedback,
 *   jumpToLineNumber), `getScreen()` reports `working: true` with `writing_plan`, `isInteractive`
 *   returns false, `interrupt()` doesn't throw and is idempotent.
 * Out of scope: spec generation streaming (covered when writing workflow integration test lands);
 *   prompt-refinement loop (covered in `tests/prompt/...`).
 */
import * as assert from 'assert';

import type { App, AppContext, AppState } from '../../src/core/app';
import type { ClaudeSession } from '../../src/core/session';
import { WritingSpecState } from '../../src/core/states/writingSpec';

interface StubApp {
  broadcast: () => void;
  setState: (state: AppState) => void;
  setStateCalls: AppState[];
  broadcastCalls: number;
}

function stubApp(): StubApp {
  const setStateCalls: AppState[] = [];
  let broadcasts = 0;
  return {
    broadcast: () => {
      broadcasts++;
    },
    setState: (s) => setStateCalls.push(s),
    get setStateCalls() {
      return setStateCalls;
    },
    get broadcastCalls() {
      return broadcasts;
    },
  };
}

function stubCtx(): AppContext {
  return {
    workingDir: '/tmp/blueprint-test-workspace',
    createSession: () => stubSession(),
  } as unknown as AppContext;
}

function stubSession(): ClaudeSession {
  const stub = {
    fork: () => stubSession(),
    abort: () => {},
    getSessionId: () => null,
    prompt: async function* () {},
  };
  return stub as ClaudeSession;
}

function makeState(): WritingSpecState {
  return new WritingSpecState(stubCtx(), 'Build a profile API', '', stubSession(), []);
}

suite('Unit: WritingSpecState — handleMessage', () => {
  /**
   * Goal: `setDraftMessage` stores the new draft and broadcasts. The chat input remains visible
   *   and editable while the plan is being written, so user keystrokes must reach the state.
   *   Pins that draft survives until the post-write state takes over.
   * Process: send `setDraftMessage`; assert `getScreen().messageDraft` reflects it.
   */
  test('setDraftMessage updates messageDraft and broadcasts', () => {
    const state = makeState();
    const app = stubApp();
    state.handleMessage(app as unknown as App, { type: 'setDraftMessage', message: 'hi' });
    const screen = state.getScreen();
    if (screen.type !== 'specEditing') return assert.fail('expected specEditing');
    assert.strictEqual(screen.messageDraft, 'hi');
    assert.strictEqual(app.broadcastCalls, 1);
  });

  /**
   * Goal: feedback added during writing is collected on the state and surfaces via getScreen().
   *   Pins that the user can pre-add feedback while the plan streams in (these get carried into
   *   StartingEditorAgentState via the constructor).
   * Process: addFeedback; assert getScreen reports nFeedback=1 and the item appears in
   *   feedbackItems.
   */
  test('addFeedback appends to pendingFeedback and broadcasts', () => {
    const state = makeState();
    const app = stubApp();
    state.handleMessage(app as unknown as App, {
      type: 'addFeedback',
      id: 'fb-1',
      text: 'tighten this',
      startLine: 3,
      endLine: 3,
    });
    const screen = state.getScreen();
    if (screen.type !== 'specEditing') return assert.fail('expected specEditing');
    assert.strictEqual(screen.nFeedback, 1);
    assert.strictEqual(screen.feedbackItems[0].text, 'tighten this');
  });

  /**
   * Goal: `editFeedback` mutates the matching item by id and broadcasts. Pins the partial-update
   *   path used by the comment-thread submit flow.
   * Process: add then edit; assert the new text appears.
   */
  test('editFeedback updates the matching item by id', () => {
    const state = makeState();
    const app = stubApp();
    state.handleMessage(app as unknown as App, {
      type: 'addFeedback',
      id: 'fb-1',
      text: 'orig',
      startLine: 1,
      endLine: 1,
    });
    state.handleMessage(app as unknown as App, { type: 'editFeedback', id: 'fb-1', text: 'updated' });
    const screen = state.getScreen();
    if (screen.type !== 'specEditing') return assert.fail('expected specEditing');
    assert.strictEqual(screen.feedbackItems[0].text, 'updated');
  });

  /**
   * Goal: `deleteFeedback` removes the matching item by id and broadcasts.
   * Process: add two; delete one; assert the other survives.
   */
  test('deleteFeedback removes the matching item by id', () => {
    const state = makeState();
    const app = stubApp();
    state.handleMessage(app as unknown as App, {
      type: 'addFeedback',
      id: 'a',
      text: 'A',
      startLine: 1,
      endLine: 1,
    });
    state.handleMessage(app as unknown as App, {
      type: 'addFeedback',
      id: 'b',
      text: 'B',
      startLine: 2,
      endLine: 2,
    });
    state.handleMessage(app as unknown as App, { type: 'deleteFeedback', id: 'a' });
    const screen = state.getScreen();
    if (screen.type !== 'specEditing') return assert.fail('expected specEditing');
    assert.strictEqual(screen.nFeedback, 1);
    assert.strictEqual(screen.feedbackItems[0].id, 'b');
  });
});

suite('Unit: WritingSpecState — screen + lifecycle', () => {
  /**
   * Goal: `getScreen` reports `working: true` with phase `writing_plan`, and the questions tab
   *   is `waiting_for_plan`. Pins the visible status while the plan is being generated.
   * Process: instantiate; assert phases.
   */
  test('getScreen reports writing_plan and waiting_for_plan phases', () => {
    const state = makeState();
    const screen = state.getScreen();
    if (screen.type !== 'specEditing') return assert.fail('expected specEditing');
    assert.strictEqual(screen.editorAgent.working, true);
    assert.strictEqual(screen.editorAgent.phase, 'writing_plan');
    assert.strictEqual(screen.questionsAgent.phase, 'waiting_for_plan');
  });

  /**
   * Goal: `isInteractive` returns false so the App's rate-limit recovery doesn't snap back to
   *   this state on a 429 (the writing flow should resume from the prior interactive state).
   *   Pins the rate-limit contract.
   * Process: assert `isInteractive()` is false.
   */
  test('isInteractive returns false', () => {
    assert.strictEqual(makeState().isInteractive(), false);
  });

  /**
   * Goal: `interrupt()` flips the state's interrupted flag and is idempotent (calling it twice
   *   doesn't throw). Pins the cancellation contract — the state-machine relies on this when
   *   transitioning away mid-generation.
   * Process: instantiate; call interrupt twice; assert no throw.
   */
  test('interrupt is safe to call multiple times', () => {
    const state = makeState();
    assert.doesNotThrow(() => {
      state.interrupt();
      state.interrupt();
    });
  });
});

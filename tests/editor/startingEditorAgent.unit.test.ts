/**
 * Unit tests for `StartingEditorAgentState`'s message handlers and screen output.
 *
 * Layer: unit (Mocha). Constructs the state directly with stub `App` and `ClaudeSession`. Skips
 *   `onEnter`/`startEditor` (which streams from a real session and calls `vscode.workspace`).
 * Scope: handleMessage routes (setDraftMessage, addFeedback, editFeedback, deleteFeedback),
 *   `getScreen()` reports `reviewing_plan` for the editor and `waiting_for_plan_review` for
 *   questions, `isInteractive` returns false.
 * Out of scope: editor warmup streaming (covered when editor-startup workflow test lands); the
 *   transition into `EditorReadyState` (exercised via `tests/editor/chat.test.ts` workflow).
 */
import * as assert from 'assert';

import type { App, AppContext, AppState } from '../../src/core/app';
import type { ClaudeSession } from '../../src/core/session';
import { StartingEditorAgentState } from '../../src/core/states/startingEditorAgent';

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

function makeState(): StartingEditorAgentState {
  return new StartingEditorAgentState(stubCtx(), 'blueprint/test/plan.md', '# Plan content', 'Build a profile API');
}

suite('Unit: StartingEditorAgentState — handleMessage', () => {
  /**
   * Goal: `setDraftMessage` updates the draft and broadcasts. The chat textarea is visible while
   *   the editor agent warms up, so user keystrokes must reach the state and be carried into
   *   `EditorReadyState` via the constructor when the warmup completes.
   * Process: send setDraftMessage; assert getScreen exposes the new draft.
   */
  test('setDraftMessage updates messageDraft and broadcasts', () => {
    const state = makeState();
    const app = stubApp();
    state.handleMessage(app as unknown as App, { type: 'setDraftMessage', message: 'queued draft' });
    const screen = state.getScreen();
    if (screen.type !== 'specEditing') return assert.fail('expected specEditing');
    assert.strictEqual(screen.messageDraft, 'queued draft');
    assert.strictEqual(app.broadcastCalls, 1);
  });

  /**
   * Goal: feedback added during the warmup is buffered on the state and surfaces via getScreen,
   *   then carried forward into the next state. Pins that the warmup window doesn't drop user
   *   actions.
   * Process: addFeedback; assert getScreen reports the item.
   */
  test('addFeedback appends to pendingFeedback', () => {
    const state = makeState();
    const app = stubApp();
    state.handleMessage(app as unknown as App, {
      type: 'addFeedback',
      id: 'a',
      text: 'note',
      startLine: 1,
      endLine: 1,
    });
    const screen = state.getScreen();
    if (screen.type !== 'specEditing') return assert.fail('expected specEditing');
    assert.strictEqual(screen.nFeedback, 1);
    assert.strictEqual(screen.feedbackItems[0].text, 'note');
  });

  /**
   * Goal: `editFeedback` and `deleteFeedback` apply during warmup too. Pins symmetric coverage
   *   with WritingSpecState — the warmup window provides the same CRUD surface.
   * Process: add → edit → delete; assert state ends empty.
   */
  test('editFeedback and deleteFeedback work during warmup', () => {
    const state = makeState();
    const app = stubApp();
    state.handleMessage(app as unknown as App, {
      type: 'addFeedback',
      id: 'a',
      text: 'orig',
      startLine: 1,
      endLine: 1,
    });
    state.handleMessage(app as unknown as App, { type: 'editFeedback', id: 'a', text: 'updated' });
    let screen = state.getScreen();
    if (screen.type !== 'specEditing') return assert.fail('expected specEditing');
    assert.strictEqual(screen.feedbackItems[0].text, 'updated');

    state.handleMessage(app as unknown as App, { type: 'deleteFeedback', id: 'a' });
    screen = state.getScreen();
    if (screen.type !== 'specEditing') return assert.fail('expected specEditing');
    assert.strictEqual(screen.nFeedback, 0);
  });
});

suite('Unit: StartingEditorAgentState — screen + lifecycle', () => {
  /**
   * Goal: `getScreen` reports `reviewing_plan` for the editor and `waiting_for_plan_review` for
   *   questions. Pins the user-visible label that explains why the editor tab is "spinning" but
   *   the plan content already exists.
   * Process: instantiate; assert phases.
   */
  test('getScreen reports reviewing_plan and waiting_for_plan_review phases', () => {
    const state = makeState();
    const screen = state.getScreen();
    if (screen.type !== 'specEditing') return assert.fail('expected specEditing');
    assert.strictEqual(screen.editorAgent.working, true);
    assert.strictEqual(screen.editorAgent.phase, 'reviewing_plan');
    assert.strictEqual(screen.questionsAgent.phase, 'waiting_for_plan_review');
  });

  /**
   * Goal: `getScreen` exposes the spec file path that was passed to the constructor. Pins that
   *   the editor (in editor.ts) sees the right path during warmup so the document is opened
   *   without waiting for the warmup to finish.
   * Process: instantiate with a known path; assert specFilePath round-trips.
   */
  test('getScreen exposes the spec file path', () => {
    const screen = makeState().getScreen();
    if (screen.type !== 'specEditing') return assert.fail('expected specEditing');
    assert.strictEqual(screen.specFilePath, 'blueprint/test/plan.md');
  });

  /**
   * Goal: `isInteractive` returns false so rate-limit recovery doesn't return to this transient
   *   state.
   * Process: assert.
   */
  test('isInteractive returns false', () => {
    assert.strictEqual(makeState().isInteractive(), false);
  });
});

/**
 * Unit tests for `EditingState`'s message handlers and screen output. EditingState is the
 * agent-working state that follows a chat send, feedback submit, or panel-answer submit; it
 * streams the agent's response into the current snapshot, then transitions back to
 * `EditorReadyState`.
 *
 * Layer: unit (Mocha). Constructs `EditingState` directly with stubs. Skips `onEnter`/sendMessage
 *   (which fork the session and invoke `prompt()`) — that path is exercised by the chat workflow
 *   integration test.
 * Scope: handleMessage routes — feedback CRUD mutates the snapshot (not a separate field, unlike
 *   WritingSpec/StartingEditor); `submitSpecFeedback` is silently ignored (button is disabled
 *   during editing); `toggleQuestionsPanel` flips collapsed and broadcasts; `setDraftMessage`
 *   updates draft. Plus `isInteractive` and `getScreen` phase reporting.
 * Out of scope: streaming logic (tested via `tests/editor/chat.test.ts`); transitions to
 *   `EditorReadyState` on completion (also workflow-tested).
 */
import * as assert from 'assert';

import type { App, AppContext, AppState } from '../../src/core/app';
import type { ClaudeSession } from '../../src/core/session';
import { SnapshotManager } from '../../src/core/snapshotManager';
import { EditingState } from '../../src/core/states/editing';

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
  } as unknown as AppContext;
}

function stubSession(): ClaudeSession {
  const stub = {
    fork: () => stubSession(),
    abort: () => {},
    getSessionId: () => 'sess-123',
    prompt: async function* () {},
  };
  return stub as ClaudeSession;
}

function makeState(): { state: EditingState; mgr: SnapshotManager } {
  const mgr = new SnapshotManager();
  const session = stubSession();
  mgr.createSnapshot({
    prompt: 'p',
    specContent: '# Plan',
    chatMessages: [],
    streamItems: [],
    editingSession: session,
    submittedFeedback: [],
    pendingFeedback: [],
    questionRounds: [],
  });
  const state = new EditingState(stubCtx(), 'blueprint/test/plan.md', mgr, session, 'Refine X');
  return { state, mgr };
}

suite('Unit: EditingState — handleMessage feedback CRUD', () => {
  /**
   * Goal: feedback added while the agent is editing is appended to the *current snapshot*'s
   *   pendingFeedback (not a separate state field, unlike WritingSpec). Pins that EditingState
   *   shares the snapshot model with EditorReadyState — so the user's feedback survives the
   *   round-trip into the next ready state.
   * Process: addFeedback; inspect the snapshot.
   */
  test('addFeedback appends to the current snapshot pendingFeedback', () => {
    const { state, mgr } = makeState();
    const app = stubApp();
    state.handleMessage(app as unknown as App, {
      type: 'addFeedback',
      id: 'fb-1',
      text: 'note',
      startLine: 1,
      endLine: 1,
    });
    const snap = mgr.getCurrentSnapshot();
    assert.strictEqual(snap?.pendingFeedback.length, 1);
    assert.strictEqual(snap?.pendingFeedback[0].id, 'fb-1');
    assert.strictEqual(app.broadcastCalls, 1);
  });

  /**
   * Goal: `editFeedback` updates the matching item by id. Pins symmetry with the ready-state
   *   handler.
   * Process: add → edit; assert text changed.
   */
  test('editFeedback updates the matching snapshot item', () => {
    const { state, mgr } = makeState();
    const app = stubApp();
    state.handleMessage(app as unknown as App, {
      type: 'addFeedback',
      id: 'a',
      text: 'orig',
      startLine: 1,
      endLine: 1,
    });
    state.handleMessage(app as unknown as App, { type: 'editFeedback', id: 'a', text: 'updated' });
    assert.strictEqual(mgr.getCurrentSnapshot()?.pendingFeedback[0].text, 'updated');
  });

  /**
   * Goal: `deleteFeedback` removes the matching item by id.
   * Process: add → delete; assert empty.
   */
  test('deleteFeedback removes the matching snapshot item', () => {
    const { state, mgr } = makeState();
    const app = stubApp();
    state.handleMessage(app as unknown as App, {
      type: 'addFeedback',
      id: 'a',
      text: 'x',
      startLine: 1,
      endLine: 1,
    });
    state.handleMessage(app as unknown as App, { type: 'deleteFeedback', id: 'a' });
    assert.strictEqual(mgr.getCurrentSnapshot()?.pendingFeedback.length, 0);
  });
});

suite('Unit: EditingState — handleMessage other routes', () => {
  /**
   * Goal: `setDraftMessage` updates the draft on the state itself (not the snapshot — drafts
   *   are local to the state and reset across transitions). Pins the draft contract.
   * Process: send setDraftMessage; assert getScreen reflects it.
   */
  test('setDraftMessage updates messageDraft and broadcasts', () => {
    const { state } = makeState();
    const app = stubApp();
    state.handleMessage(app as unknown as App, { type: 'setDraftMessage', message: 'queued' });
    const screen = state.getScreen();
    if (screen.type !== 'specEditing') return assert.fail('expected specEditing');
    assert.strictEqual(screen.messageDraft, 'queued');
    assert.strictEqual(app.broadcastCalls, 1);
  });

  /**
   * Goal: `submitSpecFeedback` is silently ignored — the FeedbackTab's Submit button is disabled
   *   during editing, but a stale message arriving after the disable propagates would cause
   *   double-submission. Pins the defensive ignore: no broadcast, no transition.
   * Process: send submitSpecFeedback; assert nothing happened.
   */
  test('submitSpecFeedback is a silent no-op while editing', () => {
    const { state } = makeState();
    const app = stubApp();
    state.handleMessage(app as unknown as App, { type: 'submitSpecFeedback' });
    assert.strictEqual(app.broadcastCalls, 0);
    assert.strictEqual(app.setStateCalls.length, 0);
  });

  /**
   * Goal: `toggleQuestionsPanel` flips the panel-collapsed flag and broadcasts. Pins the only
   *   user-visible Questions-tab interaction available during editing.
   * Process: toggle; assert getScreen.questionsPanel.collapsed flipped to true; toggle again →
   *   false.
   */
  test('toggleQuestionsPanel flips collapsed and broadcasts', () => {
    const { state } = makeState();
    const app = stubApp();
    state.handleMessage(app as unknown as App, { type: 'toggleQuestionsPanel' });
    let screen = state.getScreen();
    if (screen.type !== 'specEditing') return assert.fail('expected specEditing');
    assert.strictEqual(screen.questionsPanel?.collapsed, true);

    state.handleMessage(app as unknown as App, { type: 'toggleQuestionsPanel' });
    screen = state.getScreen();
    if (screen.type !== 'specEditing') return assert.fail('expected specEditing');
    assert.strictEqual(screen.questionsPanel?.collapsed, false);
    assert.strictEqual(app.broadcastCalls, 2);
  });
});

suite('Unit: EditingState — screen + lifecycle', () => {
  /**
   * Goal: at the start of editing (before any tool use), `editorAgent.phase` is `responding`.
   *   Pins the initial visible label — `editing_plan` only kicks in after an Edit/Write tool
   *   call, which can't be exercised without invoking sendMessage.
   * Process: instantiate; assert phase === 'responding'.
   */
  test('getScreen reports responding before any spec edit', () => {
    const { state } = makeState();
    const screen = state.getScreen();
    if (screen.type !== 'specEditing') return assert.fail('expected specEditing');
    assert.strictEqual(screen.editorAgent.working, true);
    assert.strictEqual(screen.editorAgent.phase, 'responding');
  });

  /**
   * Goal: `getScreen` exposes the editing session's id so the user can copy the resume command
   *   even while the agent is mid-stream.
   * Process: instantiate; assert sessionId matches the stub.
   */
  test('getScreen exposes the editing sessionId', () => {
    const { state } = makeState();
    const screen = state.getScreen();
    if (screen.type !== 'specEditing') return assert.fail('expected specEditing');
    assert.strictEqual(screen.sessionId, 'sess-123');
  });

  /**
   * Goal: `isInteractive` returns false so rate-limit recovery snaps back to the prior
   *   `EditorReadyState`, not this transient one.
   */
  test('isInteractive returns false', () => {
    const { state } = makeState();
    assert.strictEqual(state.isInteractive(), false);
  });

  /**
   * Goal: `interrupt()` is safe to call multiple times.
   */
  test('interrupt is safe to call multiple times', () => {
    const { state } = makeState();
    assert.doesNotThrow(() => {
      state.interrupt();
      state.interrupt();
    });
  });
});

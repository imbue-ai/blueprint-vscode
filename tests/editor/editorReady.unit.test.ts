/**
 * Unit tests for `EditorReadyState`'s chat-tab message handlers.
 *
 * Layer: unit (Mocha). Constructs `EditorReadyState` directly with a stub `App`, real
 *   `SnapshotManager`, and stub `ClaudeSession`. No streaming or filesystem.
 * Scope: chat-tab message handlers — `setDraftMessage` updates draft + broadcasts;
 *   `sendMessage` short-circuits empty drafts; `sendMessage` with content transitions to
 *   `EditingState`; `getScreen()` exposes the draft and stream items.
 * Out of scope: feedback CRUD, plan-question panel handlers, `specFileChanged` invalidation,
 *   background question generation. Those will get their own unit tests when their phases land.
 */
import * as assert from 'assert';

import type { App, AppContext, AppState } from '../../src/core/app';
import type { ClaudeSession } from '../../src/core/session';
import { SnapshotManager } from '../../src/core/snapshotManager';
import { EditingState } from '../../src/core/states/editing';
import { EditorReadyState } from '../../src/core/states/editorReady';

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
    context: { workspaceState: { get: () => undefined } },
  } as unknown as AppContext;
}

function stubSession(): ClaudeSession {
  const stub: any = {
    fork: () => stubSession(),
    abort: () => {},
    getSessionId: () => null,
    prompt: async function* () {},
  };
  return stub as ClaudeSession;
}

function makeStateWithDraft(draft: string): { state: EditorReadyState; session: ClaudeSession; mgr: SnapshotManager } {
  const mgr = new SnapshotManager();
  const session = stubSession();
  mgr.createSnapshot({
    prompt: 'p',
    specContent: '',
    chatMessages: [],
    streamItems: [],
    editingSession: session,
    submittedFeedback: [],
    pendingFeedback: [],
    questionRounds: [],
  });
  const state = new EditorReadyState(stubCtx(), 'blueprint/test/plan.md', mgr, session, draft);
  return { state, session, mgr };
}

suite('Unit: EditorReadyState — chat draft', () => {
  /**
   * Goal: `setDraftMessage` stores the new draft on the state and broadcasts so the textarea
   *   stays in sync with the user's typing. Pins the input → host data flow.
   * Process: send `setDraftMessage`; assert the draft on the next `getScreen()` reflects it
   *   and broadcast was called once.
   */
  test('setDraftMessage updates messageDraft and broadcasts', () => {
    const { state } = makeStateWithDraft('');
    const app = stubApp();
    state.handleMessage(app as unknown as App, { type: 'setDraftMessage', message: 'hello' });
    const screen = state.getScreen();
    if (screen.type !== 'specEditing') return assert.fail('expected specEditing');
    assert.strictEqual(screen.messageDraft, 'hello');
    assert.strictEqual(app.broadcastCalls, 1);
  });
});

suite('Unit: EditorReadyState — sendMessage', () => {
  /**
   * Goal: `sendMessage` with an empty/whitespace draft is a no-op — no transition, no broadcast.
   *   Pins the trim-based gate. Without it, the user could send empty edits to the agent.
   * Process: state with `draft: ''`; send `sendMessage`; assert no transition.
   */
  test('sendMessage with empty draft is a no-op', () => {
    const { state } = makeStateWithDraft('');
    const app = stubApp();
    state.handleMessage(app as unknown as App, { type: 'sendMessage' });
    assert.strictEqual(app.setStateCalls.length, 0);
  });

  /**
   * Goal: whitespace-only drafts are also rejected (uses `.trim()`). Pins the same gate as the
   *   prompt screen — submitted content must be meaningful.
   * Process: state with `draft: '   '`; send `sendMessage`; assert no transition.
   */
  test('sendMessage with whitespace-only draft is a no-op', () => {
    const { state } = makeStateWithDraft('   \n\t');
    const app = stubApp();
    state.handleMessage(app as unknown as App, { type: 'sendMessage' });
    assert.strictEqual(app.setStateCalls.length, 0);
  });

  /**
   * Goal: a non-empty draft transitions to `EditingState`, which is where the actual streaming
   *   to the editor agent happens. Pins the chat-tab dispatch path.
   * Process: state with a real draft; send `sendMessage`; assert `setState` was called once
   *   with an `EditingState`.
   */
  test('sendMessage with content transitions to EditingState', () => {
    const { state } = makeStateWithDraft('Refine the API section to mention rate limits.');
    const app = stubApp();
    state.handleMessage(app as unknown as App, { type: 'sendMessage' });
    assert.strictEqual(app.setStateCalls.length, 1);
    assert.ok(app.setStateCalls[0] instanceof EditingState);
  });

  /**
   * Goal: after `sendMessage` triggers the transition, the original state's `messageDraft` is
   *   cleared so re-entering the editor-ready state shows an empty input. Pins the cleanup
   *   contract.
   * Process: state with a draft; send `sendMessage`; assert `getScreen().messageDraft` is now
   *   empty.
   */
  test('sendMessage clears the draft on the originating state', () => {
    const { state } = makeStateWithDraft('Hello');
    const app = stubApp();
    state.handleMessage(app as unknown as App, { type: 'sendMessage' });
    const screen = state.getScreen();
    if (screen.type !== 'specEditing') return assert.fail('expected specEditing');
    assert.strictEqual(screen.messageDraft, '');
  });
});

suite('Unit: EditorReadyState — getScreen', () => {
  /**
   * Goal: `getScreen()` exposes the current snapshot's `streamItems` so the chat tab can render
   *   the conversation history. Pins the read path that ActivityStream depends on.
   * Process: build a state with a snapshot containing two stream items; assert `getScreen()`
   *   returns them in order.
   */
  test('getScreen exposes streamItems from the current snapshot', () => {
    const mgr = new SnapshotManager();
    const session = stubSession();
    mgr.createSnapshot({
      prompt: 'p',
      specContent: '',
      chatMessages: [],
      streamItems: [
        { type: 'user_message', content: 'first' },
        { type: 'assistant_message', content: 'reply' },
      ],
      editingSession: session,
      submittedFeedback: [],
      pendingFeedback: [],
      questionRounds: [],
    });
    const state = new EditorReadyState(stubCtx(), 'blueprint/x/plan.md', mgr, session);
    const screen = state.getScreen();
    if (screen.type !== 'specEditing') return assert.fail('expected specEditing');
    assert.strictEqual(screen.streamItems.length, 2);
    assert.strictEqual(screen.streamItems[0].type, 'user_message');
    assert.strictEqual(screen.streamItems[1].type, 'assistant_message');
  });

  /**
   * Goal: the editor agent's status is `ready` when in EditorReadyState. Pins that the chat
   *   input is enabled (component tests gate on this) and the status pill shows "Ready" rather
   *   than a working state.
   * Process: build any EditorReadyState; assert `getScreen().editorAgent` is `{ working: false,
   *   phase: 'ready' }`.
   */
  test('getScreen reports editorAgent as ready', () => {
    const { state } = makeStateWithDraft('');
    const screen = state.getScreen();
    if (screen.type !== 'specEditing') return assert.fail('expected specEditing');
    assert.strictEqual(screen.editorAgent.working, false);
    assert.strictEqual(screen.editorAgent.phase, 'ready');
  });
});

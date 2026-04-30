/**
 * Unit tests for `EditorReadyState`'s feedback-tab message handlers.
 *
 * Layer: unit (Mocha). Stub `App`, real `SnapshotManager`, stub `ClaudeSession`.
 * Scope: feedback CRUD (`addFeedback` / `editFeedback` / `deleteFeedback`), `submitSpecFeedback`
 *   gating + transition, and `specFileChanged` invalidation of pending feedback.
 * Out of scope: comment-thread / gutter wiring (lives in `editor/editor.ts`); the integration
 *   round-trip from feedback to agent reply.
 */
import * as assert from 'assert';

import type { App, AppContext, AppState } from '../../src/core/app';
import type { ClaudeSession } from '../../src/core/session';
import { SnapshotManager } from '../../src/core/snapshotManager';
import { EditingState } from '../../src/core/states/editing';
import { EditorReadyState } from '../../src/core/states/editorReady';
import type { FeedbackItem, QuestionRound, SpecQuestion } from '../../src/types/screens';

interface StubApp {
  broadcast: () => void;
  setState: (s: AppState) => void;
  setStateCalls: AppState[];
  broadcastCalls: number;
}

function stubApp(): StubApp {
  const calls: AppState[] = [];
  let broadcasts = 0;
  return {
    broadcast: () => {
      broadcasts++;
    },
    setState: (s) => calls.push(s),
    get setStateCalls() {
      return calls;
    },
    get broadcastCalls() {
      return broadcasts;
    },
  };
}

function stubCtx(): AppContext {
  return {
    workingDir: '/tmp/blueprint-test',
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

function makeFeedback(id: string, partial: Partial<FeedbackItem> = {}): FeedbackItem {
  return { id, text: `feedback-${id}`, startLine: 1, endLine: 1, ...partial };
}

function makeState(initial: {
  pendingFeedback?: FeedbackItem[];
  questionRounds?: QuestionRound[];
  specContent?: string;
}) {
  const mgr = new SnapshotManager();
  mgr.createSnapshot({
    prompt: 'p',
    specContent: initial.specContent ?? '',
    chatMessages: [],
    streamItems: [],
    editingSession: stubSession(),
    submittedFeedback: [],
    pendingFeedback: initial.pendingFeedback ?? [],
    questionRounds: initial.questionRounds ?? [],
  });
  const state = new EditorReadyState(stubCtx(), 'blueprint/test/plan.md', mgr, stubSession());
  return { state, mgr };
}

suite('Unit: EditorReadyState — feedback CRUD', () => {
  /**
   * Goal: `addFeedback` appends a new item to the snapshot's `pendingFeedback` and broadcasts.
   *   Pins the create path that the gutter "+" affordance ultimately drives.
   * Process: state with no pending feedback; send `addFeedback`; assert the item is on the
   *   snapshot and broadcast fired.
   */
  test('addFeedback appends to pendingFeedback and broadcasts', () => {
    const { state, mgr } = makeState({});
    const app = stubApp();
    state.handleMessage(app as unknown as App, {
      type: 'addFeedback',
      id: 'a',
      text: 'first feedback',
      startLine: 5,
      endLine: 5,
    });
    const snap = mgr.getCurrentSnapshot()!;
    assert.strictEqual(snap.pendingFeedback.length, 1);
    assert.strictEqual(snap.pendingFeedback[0].id, 'a');
    assert.strictEqual(snap.pendingFeedback[0].text, 'first feedback');
    assert.strictEqual(app.broadcastCalls, 1);
  });

  /**
   * Goal: `editFeedback` updates the matching item's text in-place; other items unchanged.
   *   Pins the rename-by-id update path.
   * Process: state with two items; edit one; assert only that one's text changed.
   */
  test('editFeedback updates the matching item by id', () => {
    const { state, mgr } = makeState({
      pendingFeedback: [makeFeedback('a', { text: 'orig-a' }), makeFeedback('b', { text: 'orig-b' })],
    });
    const app = stubApp();
    state.handleMessage(app as unknown as App, { type: 'editFeedback', id: 'a', text: 'updated-a' });
    const items = mgr.getCurrentSnapshot()!.pendingFeedback;
    assert.strictEqual(items.find((i) => i.id === 'a')?.text, 'updated-a');
    assert.strictEqual(items.find((i) => i.id === 'b')?.text, 'orig-b');
    assert.strictEqual(app.broadcastCalls, 1);
  });

  /**
   * Goal: `deleteFeedback` removes the matching item; others survive. Pins the delete path.
   * Process: state with two items; delete one; assert only the other remains.
   */
  test('deleteFeedback removes the matching item by id', () => {
    const { state, mgr } = makeState({ pendingFeedback: [makeFeedback('a'), makeFeedback('b')] });
    const app = stubApp();
    state.handleMessage(app as unknown as App, { type: 'deleteFeedback', id: 'a' });
    const items = mgr.getCurrentSnapshot()!.pendingFeedback;
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].id, 'b');
  });
});

suite('Unit: EditorReadyState — submitSpecFeedback', () => {
  /**
   * Goal: with no pending feedback, `submitSpecFeedback` is a no-op. Pins the empty gate so
   *   the user doesn't trigger a wasted agent call when the Submit button is incorrectly
   *   enabled.
   * Process: state with `pendingFeedback: []`; send `submitSpecFeedback`; assert no transition.
   */
  test('is a no-op when no pending feedback exists', () => {
    const { state } = makeState({});
    const app = stubApp();
    state.handleMessage(app as unknown as App, { type: 'submitSpecFeedback' });
    assert.strictEqual(app.setStateCalls.length, 0);
  });

  /**
   * Goal: with pending feedback, `submitSpecFeedback` transitions to `EditingState` carrying
   *   the batched feedback prompt. Pins the path that turns the user's accumulated feedback
   *   into a single agent message.
   * Process: state with one feedback item; submit; assert `setState` called with EditingState.
   */
  test('transitions to EditingState when pending feedback exists', () => {
    const { state } = makeState({ pendingFeedback: [makeFeedback('a', { text: 'tighten the API section' })] });
    const app = stubApp();
    state.handleMessage(app as unknown as App, { type: 'submitSpecFeedback' });
    assert.strictEqual(app.setStateCalls.length, 1);
    assert.ok(app.setStateCalls[0] instanceof EditingState);
  });
});

suite('Unit: EditorReadyState — specFileChanged invalidation', () => {
  /**
   * Goal: when the plan file changes externally, all pending feedback is dropped because line
   *   numbers may have shifted. Pins the documented invalidation rule (today the rule is
   *   "wipe everything"; the source has a TODO to refine to per-anchor invalidation, but until
   *   that lands this is the contract).
   * Process: state with two pending feedback items; send `specFileChanged`; assert
   *   `pendingFeedback` is empty and broadcast fired.
   */
  test('clears all pending feedback on specFileChanged', () => {
    const { state, mgr } = makeState({
      pendingFeedback: [makeFeedback('a'), makeFeedback('b')],
    });
    const app = stubApp();
    state.handleMessage(app as unknown as App, { type: 'specFileChanged', specContent: '# Changed\n' });
    assert.strictEqual(mgr.getCurrentSnapshot()!.pendingFeedback.length, 0);
    assert.strictEqual(app.broadcastCalls, 1);
  });

  /**
   * Goal: `specFileChanged` updates the snapshot's `specContent` so subsequent line-resolution
   *   uses the latest text. Pins the content-write path.
   * Process: send `specFileChanged` with new content; assert the snapshot reflects it.
   */
  test('updates the snapshot specContent on specFileChanged', () => {
    const { state, mgr } = makeState({ specContent: '# Old\n' });
    const app = stubApp();
    state.handleMessage(app as unknown as App, { type: 'specFileChanged', specContent: '# New content\n' });
    assert.strictEqual(mgr.getCurrentSnapshot()!.specContent, '# New content\n');
  });

  /**
   * Goal: questions whose anchors no longer resolve in the new spec content are dropped from
   *   non-frozen rounds; questions with valid anchors survive; frozen rounds are preserved.
   *   Pins the broken-anchor invalidation that runs alongside the feedback wipe.
   * Process: state with one frozen and one active round; the active round has a question whose
   *   anchor is missing from the new content; send `specFileChanged`; assert the active round's
   *   broken question is gone, the active round's resolvable question stays, and the frozen
   *   round is untouched.
   */
  test('drops broken-anchor questions in non-frozen rounds; keeps frozen rounds intact', () => {
    const findable: SpecQuestion = {
      text: 'Q1',
      anchor: 'still here',
      textAnswer: '',
      chosenIndices: [],
    };
    const broken: SpecQuestion = {
      text: 'Q2',
      anchor: 'gone now',
      textAnswer: '',
      chosenIndices: [],
    };
    const frozenQuestion: SpecQuestion = {
      text: 'Q3',
      anchor: 'historical anchor',
      textAnswer: '',
      chosenIndices: [],
    };
    const { state, mgr } = makeState({
      questionRounds: [
        { questions: [frozenQuestion], frozen: true },
        { questions: [findable, broken], frozen: false },
      ],
    });
    const app = stubApp();
    state.handleMessage(app as unknown as App, {
      type: 'specFileChanged',
      specContent: 'still here is on this line\n',
    });
    const snap = mgr.getCurrentSnapshot()!;
    assert.strictEqual(snap.questionRounds.length, 2, 'both rounds should survive');
    assert.strictEqual(snap.questionRounds[0].frozen, true);
    assert.strictEqual(snap.questionRounds[0].questions.length, 1, 'frozen round preserved verbatim');
    assert.strictEqual(snap.questionRounds[1].questions.length, 1, 'broken question dropped');
    assert.strictEqual(snap.questionRounds[1].questions[0].anchor, 'still here');
  });
});

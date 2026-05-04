/**
 * Unit tests for the plan-questions-panel message handlers in
 * `core/utils/panelQuestionHandlers.ts`.
 *
 * Layer: unit (Mocha). Tests run with stub `App`, real `SnapshotManager`, and stub
 *   `ClaudeSession`. No streaming, no filesystem.
 * Scope: synchronous-handler logic and pure data transforms — `handleAnswerPanelQuestion`
 *   targeting active rounds, `handleSubmitPanelAnswers` freezing + transitioning,
 *   `handleRefreshQuestions` gating + freezing, `buildQuestionsPanelRounds` line-resolution
 *   and anchor-based filtering.
 * Out of scope: `runBackgroundGeneration` (covered indirectly via integration tests when the
 *   background-question flow gets one); the agentic question-generation functions in
 *   `core/questionGeneration.ts` (separate module).
 */
import * as assert from 'assert';

import type { App, AppContext, AppState } from '../../src/core/app';
import type { ClaudeSession } from '../../src/core/session';
import { SnapshotManager } from '../../src/core/snapshotManager';
import { EditingState } from '../../src/core/states/editing';
import {
  buildQuestionsPanelRounds,
  handleAnswerPanelQuestion,
  handleRefreshQuestions,
  handleSubmitPanelAnswers,
  type PanelState,
} from '../../src/core/utils/panelQuestionHandlers';
import type { QuestionRound, SpecQuestion } from '../../src/types/screens';

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

function makeQuestion(anchor: string, partial: Partial<SpecQuestion> = {}): SpecQuestion {
  return { text: `Q-${anchor}`, anchor, textAnswer: '', chosenIndices: [], ...partial };
}

function makePanelState(overrides: Partial<PanelState> = {}): PanelState {
  return {
    panelCollapsed: false,
    questionGenerating: false,
    questioningToolCalls: [],
    abortSignal: { aborted: false },
    ...overrides,
  };
}

function makeMgrWithRounds(specContent: string, rounds: QuestionRound[]): SnapshotManager {
  const mgr = new SnapshotManager();
  mgr.createSnapshot({
    prompt: 'p',
    specContent,
    chatMessages: [],
    streamItems: [],
    editingSession: stubSession(),
    submittedFeedback: [],
    pendingFeedback: [],
    questionRounds: rounds,
  });
  return mgr;
}

suite('Unit: handleAnswerPanelQuestion', () => {
  /**
   * Goal: answering a question in the active (non-frozen) round mutates its text/chosen indices
   *   and broadcasts. Pins the answer-write path that drives the panel UI.
   * Process: build a snapshot with one active round and one question; call the handler with
   *   the question's anchor; assert the question fields are set and broadcast fired once.
   */
  test('mutates the matching question in the active round and broadcasts', () => {
    const q = makeQuestion('overview');
    const mgr = makeMgrWithRounds('# Overview\n', [{ questions: [q], frozen: false }]);
    const app = stubApp();
    handleAnswerPanelQuestion(mgr, app as unknown as App, 'overview', 'use postgres', [0]);
    assert.strictEqual(q.textAnswer, 'use postgres');
    assert.deepStrictEqual(q.chosenIndices, [0]);
    assert.strictEqual(app.broadcastCalls, 1);
  });

  /**
   * Goal: questions in frozen rounds are read-only — answering them is a no-op. Pins the
   *   "history is immutable" rule for the panel.
   * Process: build a snapshot with one frozen round; call the handler; assert no mutation
   *   and no broadcast.
   */
  test('ignores questions in frozen rounds', () => {
    const q = makeQuestion('overview');
    const mgr = makeMgrWithRounds('# Overview\n', [{ questions: [q], frozen: true }]);
    const app = stubApp();
    handleAnswerPanelQuestion(mgr, app as unknown as App, 'overview', 'X', [1]);
    assert.strictEqual(q.textAnswer, '');
    assert.strictEqual(app.broadcastCalls, 0);
  });

  /**
   * Goal: an unknown anchor is a no-op (defensive). The webview could send a stale anchor
   *   after the question was filtered out by `filterValidQuestionRounds`; the handler must
   *   not crash.
   * Process: build a snapshot with one active question; call with a non-existent anchor;
   *   assert no broadcast.
   */
  test('is a no-op for an unknown anchor', () => {
    const mgr = makeMgrWithRounds('# Overview\n', [{ questions: [makeQuestion('overview')], frozen: false }]);
    const app = stubApp();
    handleAnswerPanelQuestion(mgr, app as unknown as App, 'no-such-anchor', 'X', []);
    assert.strictEqual(app.broadcastCalls, 0);
  });
});

suite('Unit: handleSubmitPanelAnswers', () => {
  /**
   * Goal: while questions are still being generated (`panelState.questionGenerating === true`),
   *   submitting is a no-op — clicking Submit during generation must not race the agent.
   * Process: panel state with `questionGenerating: true`; call submit; assert no transition.
   */
  test('is a no-op while panelState.questionGenerating is true', () => {
    const q = makeQuestion('overview', { textAnswer: 'foo' });
    const mgr = makeMgrWithRounds('# Overview\n', [{ questions: [q], frozen: false }]);
    const app = stubApp();
    handleSubmitPanelAnswers(
      stubCtx(),
      'p.md',
      mgr,
      stubSession(),
      stubSession(),
      app as unknown as App,
      makePanelState({ questionGenerating: true }),
    );
    assert.strictEqual(app.setStateCalls.length, 0);
  });

  /**
   * Goal: with no answered questions in the active round, submit is a no-op (nothing to send).
   *   Pins the gate that prevents an empty refinement round.
   * Process: build a snapshot with active round questions but none answered; call submit;
   *   assert no transition.
   */
  test('is a no-op when no questions in the active round are answered', () => {
    const mgr = makeMgrWithRounds('# Overview\n', [{ questions: [makeQuestion('overview')], frozen: false }]);
    const app = stubApp();
    handleSubmitPanelAnswers(
      stubCtx(),
      'p.md',
      mgr,
      stubSession(),
      stubSession(),
      app as unknown as App,
      makePanelState(),
    );
    assert.strictEqual(app.setStateCalls.length, 0);
  });

  /**
   * Goal: with at least one answered question, submit freezes the active round AND transitions
   *   to `EditingState` with `backgroundRegenOnComplete=true` (questions should regenerate after
   *   the edit lands).
   * Process: build a snapshot with one answered question; call submit; assert the round is
   *   frozen on the snapshot and `setState` was called with an EditingState.
   */
  test('freezes the active round and transitions to EditingState when answers exist', () => {
    const q = makeQuestion('overview', { textAnswer: 'use postgres' });
    const mgr = makeMgrWithRounds('# Overview\n', [{ questions: [q], frozen: false }]);
    const app = stubApp();
    handleSubmitPanelAnswers(
      stubCtx(),
      'p.md',
      mgr,
      stubSession(),
      stubSession(),
      app as unknown as App,
      makePanelState(),
    );
    assert.strictEqual(app.setStateCalls.length, 1);
    assert.ok(app.setStateCalls[0] instanceof EditingState);
    const snap = mgr.getCurrentSnapshot();
    assert.ok(snap?.questionRounds[0].frozen, 'active round should be frozen after submit');
  });

  /**
   * Goal: when the active round has already been frozen (e.g. via Refresh), submit is a no-op.
   *   Pins that there's no double-transition path.
   * Process: build a snapshot with a frozen round; call submit; assert no transition.
   */
  test('is a no-op when the latest round is already frozen', () => {
    const q = makeQuestion('overview', { textAnswer: 'foo' });
    const mgr = makeMgrWithRounds('# Overview\n', [{ questions: [q], frozen: true }]);
    const app = stubApp();
    handleSubmitPanelAnswers(
      stubCtx(),
      'p.md',
      mgr,
      stubSession(),
      stubSession(),
      app as unknown as App,
      makePanelState(),
    );
    assert.strictEqual(app.setStateCalls.length, 0);
  });
});

suite('Unit: handleRefreshQuestions', () => {
  /**
   * Goal: while questions are generating, refresh is a no-op — pins the same gate as submit.
   * Process: panel state with `questionGenerating: true`; call refresh; assert no broadcast
   *   and the round (if any) is unchanged.
   */
  test('is a no-op while panelState.questionGenerating is true', () => {
    const mgr = makeMgrWithRounds('', [{ questions: [makeQuestion('a')], frozen: false }]);
    const app = stubApp();
    handleRefreshQuestions(
      makePanelState({ questionGenerating: true }),
      mgr,
      stubSession(),
      stubCtx(),
      'p.md',
      app as unknown as App,
    );
    assert.strictEqual(app.broadcastCalls, 0);
    assert.strictEqual(mgr.getCurrentSnapshot()?.questionRounds[0].frozen, false);
  });

  /**
   * Goal: when the active round is non-frozen, refresh freezes it (so it's preserved as history)
   *   before kicking off the new round. Pins the freeze step.
   * Process: build a non-frozen round; call refresh; assert the snapshot's round is now frozen.
   */
  test('freezes the active round before kicking off new generation', () => {
    const mgr = makeMgrWithRounds('', [{ questions: [makeQuestion('a')], frozen: false }]);
    const app = stubApp();
    handleRefreshQuestions(makePanelState(), mgr, stubSession(), stubCtx(), 'p.md', app as unknown as App);
    assert.strictEqual(mgr.getCurrentSnapshot()?.questionRounds[0].frozen, true);
  });

  /**
   * Goal: refresh requires a `questionsSession` — without one, the function bails. Pins the
   *   guard against null sessions (e.g. before warmup completes).
   * Process: call refresh with null session; assert the round (if any) is unchanged and no
   *   broadcast fired.
   */
  test('is a no-op when there is no questions session', () => {
    const mgr = makeMgrWithRounds('', [{ questions: [makeQuestion('a')], frozen: false }]);
    const app = stubApp();
    handleRefreshQuestions(makePanelState(), mgr, null, stubCtx(), 'p.md', app as unknown as App);
    assert.strictEqual(app.broadcastCalls, 0);
    assert.strictEqual(mgr.getCurrentSnapshot()?.questionRounds[0].frozen, false);
  });
});

suite('Unit: buildQuestionsPanelRounds', () => {
  /**
   * Goal: each question's `line` is resolved via `findAnchorLine` against the current spec
   *   content. Pins the read-time line resolution that drives the jump-to-line UX.
   * Process: build with a question whose anchor exists in the spec; assert the resolved line
   *   matches the anchor's position.
   */
  test('resolves line numbers for questions whose anchors appear in the spec', () => {
    const specContent = 'Line 0\nLine 1 anchor here\nLine 2\n';
    const rounds: QuestionRound[] = [{ questions: [makeQuestion('anchor here')], frozen: false }];
    const result = buildQuestionsPanelRounds(specContent, rounds);
    assert.strictEqual(result[0].questions[0].line, 1);
  });

  /**
   * Goal: in a non-frozen round, questions whose anchors are no longer findable in the spec
   *   are dropped. Pins the broken-anchor invalidation that keeps the panel relevant after
   *   plan edits.
   * Process: build with two questions — one whose anchor is in the spec, one whose isn't;
   *   assert only the resolvable one survives.
   */
  test('drops questions with broken anchors in non-frozen rounds', () => {
    const rounds: QuestionRound[] = [
      {
        questions: [makeQuestion('Found anchor'), makeQuestion('Missing anchor')],
        frozen: false,
      },
    ];
    const result = buildQuestionsPanelRounds('Found anchor is here\n', rounds);
    assert.strictEqual(result[0].questions.length, 1);
    assert.strictEqual(result[0].questions[0].anchor, 'Found anchor');
  });

  /**
   * Goal: frozen rounds preserve all questions even when their anchors are no longer findable.
   *   Pins the immutable-history rule — past rounds shouldn't lose questions just because the
   *   plan has been edited.
   * Process: build a frozen round with a missing-anchor question; assert it survives.
   */
  test('keeps all questions in frozen rounds regardless of anchor resolution', () => {
    const rounds: QuestionRound[] = [{ questions: [makeQuestion('Missing anchor')], frozen: true }];
    const result = buildQuestionsPanelRounds('Different content\n', rounds);
    assert.strictEqual(result[0].questions.length, 1);
  });

  /**
   * Goal: questions in the result are sorted by their resolved `line` so the panel reads
   *   top-to-bottom matching the plan's flow. Pins the visual ordering contract.
   * Process: build with two questions whose anchors are at different lines, in reverse order
   *   in the input; assert the result is sorted by line ascending.
   */
  test('sorts questions by resolved line number', () => {
    const specContent = 'aaa\nfirst anchor\nbbb\nsecond anchor\n';
    const rounds: QuestionRound[] = [
      { questions: [makeQuestion('second anchor'), makeQuestion('first anchor')], frozen: false },
    ];
    const result = buildQuestionsPanelRounds(specContent, rounds);
    assert.strictEqual(result[0].questions[0].anchor, 'first anchor');
    assert.strictEqual(result[0].questions[1].anchor, 'second anchor');
  });
});

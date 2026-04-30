/**
 * Unit tests for `PromptQuestionsState` — the idle state of the prompt-refinement phase, where
 * the user reviews questions, optionally answers some, and chooses "Keep planning" or
 * "Generate plan".
 *
 * Layer: unit (Mocha). Constructs `PromptQuestionsState` directly with stub `App`, `AppContext`,
 *   and `ClaudeSession`. No harness, no extension activation.
 * Scope: the message handlers — answer mutations, refinement transitions, generate-plan
 *   transitions, and interrupt cleanup.
 * Out of scope: the questioning agent stream itself (covered by the component tests for
 *   `PromptRefinementScreen` and the integration test in `tests/workflows/submit-prompt.test.ts`);
 *   the deeper questioning-state machine (`GeneratingPromptQuestionsState`) which has its own flow.
 */
import * as assert from 'assert';

import type { App, AppContext, AppState } from '../../src/core/app';
import type { ClaudeSession } from '../../src/core/session';
import { GeneratingPromptQuestionsState } from '../../src/core/states/generatingPromptQuestions';
import { PromptQuestionsState } from '../../src/core/states/promptQuestions';
import { WritingSpecState } from '../../src/core/states/writingSpec';
import type { PromptQuestion } from '../../src/types/promptQuestion';

interface StubApp {
  broadcast: () => void;
  setState: (state: AppState) => void;
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
    setState: (state: AppState) => {
      calls.push(state);
    },
    get setStateCalls() {
      return calls;
    },
    get broadcastCalls() {
      return broadcasts;
    },
  };
}

function stubCtx(): AppContext {
  return { context: { workspaceState: { get: () => undefined } } } as unknown as AppContext;
}

function stubSession(abortSpy?: () => void): ClaudeSession {
  const stub: any = {
    fork: () => stubSession(),
    abort: () => abortSpy?.(),
    prompt: async function* () {},
    getSessionId: () => null,
  };
  return stub as ClaudeSession;
}

function makeQuestion(id: number, partial: Partial<PromptQuestion> = {}): PromptQuestion {
  return { id, text: `Q${id}`, textAnswer: '', chosenIndices: [], ...partial };
}

function makeState(opts: {
  questions?: PromptQuestion[];
  session?: ClaudeSession;
  roundCount?: number;
}): PromptQuestionsState {
  return new PromptQuestionsState(
    stubCtx(),
    'Build a profile API',
    'template-id',
    opts.session ?? stubSession(),
    [],
    opts.questions ?? [],
    1,
    opts.roundCount ?? 1,
    0,
  );
}

suite('Unit: PromptQuestionsState', () => {
  /**
   * Goal: `answerPromptQuestion` mutates the targeted question's `textAnswer` and
   *   `chosenIndices`, then broadcasts. Without the mutation, "Keep planning" would have no
   *   answers to incorporate; without the broadcast, the screen would show stale answer state.
   * Process: send `answerPromptQuestion` for an existing question; assert the question's fields
   *   are updated and broadcast was called once.
   */
  test('answerPromptQuestion updates the targeted question and broadcasts', () => {
    const q = makeQuestion(1);
    const state = makeState({ questions: [q] });
    const app = stubApp();
    state.handleMessage(app as unknown as App, {
      type: 'answerPromptQuestion',
      questionId: 1,
      textAnswer: 'PostgreSQL',
      chosenIndices: [0],
    });
    assert.strictEqual(q.textAnswer, 'PostgreSQL');
    assert.deepStrictEqual(q.chosenIndices, [0]);
    assert.strictEqual(app.broadcastCalls, 1);
  });

  /**
   * Goal: `answerPromptQuestion` with an unknown `questionId` is a no-op. Defensive: the
   *   webview could send a stale id after a state transition; the handler must not crash.
   * Process: send `answerPromptQuestion` with a non-existent id; assert no broadcast and no
   *   mutation.
   */
  test('answerPromptQuestion with unknown questionId is a no-op', () => {
    const q = makeQuestion(1);
    const state = makeState({ questions: [q] });
    const app = stubApp();
    state.handleMessage(app as unknown as App, {
      type: 'answerPromptQuestion',
      questionId: 999,
      textAnswer: 'X',
      chosenIndices: [],
    });
    assert.strictEqual(q.textAnswer, '');
    assert.strictEqual(app.broadcastCalls, 0);
  });

  /**
   * Goal: `refinePrompt` with no answered questions is a no-op — clicking "Keep planning"
   *   without answers has nothing to refine. Mirrors the `refineDisabled` UI gate.
   * Process: send `refinePrompt` with all-unanswered questions; assert no transition.
   */
  test('refinePrompt with no answers is a no-op', () => {
    const state = makeState({ questions: [makeQuestion(1)] });
    const app = stubApp();
    state.handleMessage(app as unknown as App, { type: 'refinePrompt' });
    assert.strictEqual(app.setStateCalls.length, 0);
  });

  /**
   * Goal: `refinePrompt` with at least one answered question transitions to
   *   `GeneratingPromptQuestionsState` with a `QuestioningContinuation` carrying the answers
   *   forward. Pins the refinement loop entry point.
   * Process: answer one question; send `refinePrompt`; assert transition.
   */
  test('refinePrompt with at least one answer transitions to GeneratingPromptQuestionsState', () => {
    const state = makeState({ questions: [makeQuestion(1, { textAnswer: 'PostgreSQL' })] });
    const app = stubApp();
    state.handleMessage(app as unknown as App, { type: 'refinePrompt' });
    assert.strictEqual(app.setStateCalls.length, 1);
    assert.ok(app.setStateCalls[0] instanceof GeneratingPromptQuestionsState);
  });

  /**
   * Goal: `generateSpec` always transitions to `WritingSpecState` regardless of whether any
   *   questions are answered — the user can bail out of questioning at any time. Pins the
   *   plan-generation entry point.
   * Process: send `generateSpec` with no answers; assert transition to WritingSpecState.
   */
  test('generateSpec transitions to WritingSpecState even with no answers', () => {
    const state = makeState({ questions: [makeQuestion(1)] });
    const app = stubApp();
    state.handleMessage(app as unknown as App, { type: 'generateSpec' });
    assert.strictEqual(app.setStateCalls.length, 1);
    assert.ok(app.setStateCalls[0] instanceof WritingSpecState);
  });

  /**
   * Goal: `interrupt()` aborts the underlying questioning session so a half-streamed agent
   *   doesn't keep running after the user navigates away. Pins the cleanup contract.
   * Process: stub a session with an abort spy; call `interrupt()`; assert abort was invoked.
   */
  test('interrupt aborts the questioning session', () => {
    let aborted = false;
    const state = makeState({ session: stubSession(() => (aborted = true)) });
    state.interrupt();
    assert.strictEqual(aborted, true);
  });
});

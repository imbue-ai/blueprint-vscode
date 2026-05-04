/**
 * Unit tests for `GeneratingPromptQuestionsState` — the actively-streaming state of the
 * questioning phase.
 *
 * Layer: unit (Mocha). Constructs the state directly with stub `App`, `AppContext`, and
 *   `ClaudeSession`. Tests that don't trigger streaming (constructor seeding, message handlers,
 *   interrupt cleanup) live here. Tests that require driving the agent stream (tool-call
 *   rendering, rate-limit propagation) live in `tests/prompt/submit.test.ts` since they need
 *   the harness + scripted SDK messages.
 * Scope: constructor flag seeding (the documented gotcha around setState broadcasting before
 *   onEnter), continuation-path question-freezing and state inheritance, message handlers
 *   (answer mutation, generate-spec transition), and `interrupt()`'s cleanup contract.
 * Out of scope: the streaming behavior itself (integration territory).
 */
import * as assert from 'assert';

import type { App, AppContext, AppState } from '../../src/core/app';
import type { ClaudeSession } from '../../src/core/session';
import { GeneratingPromptQuestionsState } from '../../src/core/states/generatingPromptQuestions';
import { WritingSpecState } from '../../src/core/states/writingSpec';
import type { PromptQuestion } from '../../src/types/promptQuestion';

interface StubApp {
  broadcast: () => void;
  setState: (state: AppState) => void;
  onRateLimit: (resetsAt?: number) => void;
  setStateCalls: AppState[];
  broadcastCalls: number;
  rateLimitCalls: number;
}

function stubApp(): StubApp {
  const setStateCalls: AppState[] = [];
  let broadcasts = 0;
  let rateLimits = 0;
  return {
    broadcast: () => {
      broadcasts++;
    },
    setState: (state) => {
      setStateCalls.push(state);
    },
    onRateLimit: () => {
      rateLimits++;
    },
    get setStateCalls() {
      return setStateCalls;
    },
    get broadcastCalls() {
      return broadcasts;
    },
    get rateLimitCalls() {
      return rateLimits;
    },
  };
}

function stubCtx(): AppContext {
  return { context: { workspaceState: { get: () => undefined } } } as unknown as AppContext;
}

function stubSession(abortSpy?: () => void): ClaudeSession {
  const stub: any = {
    fork: () => stubSession(abortSpy),
    abort: () => abortSpy?.(),
    prompt: async function* () {},
    getSessionId: () => null,
  };
  return stub as ClaudeSession;
}

function makeQuestion(id: number, partial: Partial<PromptQuestion> = {}): PromptQuestion {
  return { id, text: `Q${id}`, textAnswer: '', chosenIndices: [], ...partial };
}

suite('Unit: GeneratingPromptQuestionsState — constructor flag seeding', () => {
  /**
   * Goal: on the initial path (no continuation), the constructor must seed `streaming = true`
   *   so the very first render — which fires before `onEnter` runs — already shows the agent
   *   as working. This is the documented gotcha: `app.setState` broadcasts before `onEnter`,
   *   so without seeding the user sees a brief "Ready" flash before the async path catches up.
   * Process: construct without continuation; call `getScreen()`; assert `agentStatus.working`
   *   is true and `phase` is `'generating_questions'`.
   */
  test('seeds streaming=true on the initial path so the first render shows working', () => {
    const state = new GeneratingPromptQuestionsState(stubCtx(), 'Build a thing', 'tpl');
    const screen = state.getScreen();
    assert.strictEqual(screen.type, 'promptRefinement');
    if (screen.type !== 'promptRefinement') return;
    assert.strictEqual(screen.agentStatus.working, true);
    assert.strictEqual(screen.agentStatus.phase, 'generating_questions');
    assert.strictEqual(screen.questionsLoading, true);
  });

  /**
   * Goal: on the continuation path, the constructor must seed `refining = true` (not streaming)
   *   so the first render shows "updating prompt" instead of "generating questions". Same root
   *   reason as the initial-path test: setState broadcasts before onEnter.
   * Process: construct with a continuation; assert `agentStatus.phase` is `'updating_prompt'`
   *   and `refining` is true.
   */
  test('seeds refining=true on the continuation path', () => {
    const continuation = {
      session: stubSession(),
      messages: [],
      activeQuestions: [],
      nextQuestionId: 0,
      roundCount: 1,
      answers: [{ question: 'q', answer: 'a' }],
    };
    const state = new GeneratingPromptQuestionsState(stubCtx(), 'p', 'tpl', continuation);
    const screen = state.getScreen();
    if (screen.type !== 'promptRefinement') return assert.fail('expected promptRefinement');
    assert.strictEqual(screen.refining, true);
    assert.strictEqual(screen.agentStatus.phase, 'updating_prompt');
    assert.strictEqual(screen.agentStatus.working, true);
  });
});

suite('Unit: GeneratingPromptQuestionsState — continuation path inherits previous round', () => {
  /**
   * Goal: on continuation, all questions in the inherited messages list must be marked frozen
   *   so the UI renders them as read-only. Pins the freeze step in the constructor — without
   *   it, users could re-edit answers from the previous round during the new one.
   * Process: build a continuation with one un-frozen question message; construct the state;
   *   assert the message in the state's getScreen result has `frozen: true`.
   */
  test('freezes previous-round questions in inherited messages', () => {
    const q = makeQuestion(1);
    const continuation = {
      session: stubSession(),
      messages: [{ type: 'question' as const, question: q, frozen: false }],
      activeQuestions: [q],
      nextQuestionId: 2,
      roundCount: 1,
      answers: [],
    };
    const state = new GeneratingPromptQuestionsState(stubCtx(), 'p', 'tpl', continuation);
    const screen = state.getScreen();
    if (screen.type !== 'promptRefinement') return assert.fail('expected promptRefinement');
    const frozen = screen.questioningMessages.find((m) => m.type === 'question');
    assert.ok(frozen?.type === 'question' && frozen.frozen === true);
  });

  /**
   * Goal: on continuation, `roundStartIndex` is anchored at the end of the inherited messages
   *   so the UI doesn't treat index=0 as a new-round trigger and scroll to the top before the
   *   real round-start position lands. Pins the second documented gotcha.
   * Process: build a continuation with two messages; construct; assert `roundStartIndex` equals
   *   the inherited message count (2).
   */
  test('anchors roundStartIndex past the inherited messages', () => {
    const continuation = {
      session: stubSession(),
      messages: [
        { type: 'text' as const, content: 'previous explanation' },
        { type: 'question' as const, question: makeQuestion(1), frozen: false },
      ],
      activeQuestions: [],
      nextQuestionId: 2,
      roundCount: 1,
      answers: [],
    };
    const state = new GeneratingPromptQuestionsState(stubCtx(), 'p', 'tpl', continuation);
    const screen = state.getScreen();
    if (screen.type !== 'promptRefinement') return assert.fail('expected promptRefinement');
    assert.strictEqual(screen.roundStartIndex, 2);
  });

  /**
   * Goal: on continuation, the inherited active questions are carried forward into the new
   *   state's `activeQuestions`. Pins that user answers from the previous round survive the
   *   transition and reappear when the new round adds questions.
   * Process: build continuation with one active question (with an answer); assert the state's
   *   `getScreen().questions` includes it.
   */
  test('carries forward inherited active questions', () => {
    const q = makeQuestion(1, { textAnswer: 'Postgres' });
    const continuation = {
      session: stubSession(),
      messages: [{ type: 'question' as const, question: q, frozen: false }],
      activeQuestions: [q],
      nextQuestionId: 2,
      roundCount: 1,
      answers: [],
    };
    const state = new GeneratingPromptQuestionsState(stubCtx(), 'p', 'tpl', continuation);
    const screen = state.getScreen();
    if (screen.type !== 'promptRefinement') return assert.fail('expected promptRefinement');
    assert.strictEqual(screen.questions.length, 1);
    assert.strictEqual(screen.questions[0].textAnswer, 'Postgres');
  });

  /**
   * Goal: `roundCount` is anchored at construction — a continuation is round N+1, and an
   *   initial entry is round 1. Pins `getScreen().isFirstRound` as the visible signal so the
   *   refinement screen can hide the action buttons during the first round of streaming but
   *   keep them visible on continuation rounds (where the user's accumulated answers should
   *   stay actionable).
   * Process: build a continuation with `roundCount: 1`; construct; assert isFirstRound is false
   *   (the new state is round 2). Then build with no continuation; assert isFirstRound is true.
   */
  test('continuation reports isFirstRound=false; no continuation reports true', () => {
    const continuation = {
      session: stubSession(),
      messages: [],
      activeQuestions: [],
      nextQuestionId: 0,
      roundCount: 1,
      answers: [{ question: 'q', answer: 'a' }],
    };
    const cont = new GeneratingPromptQuestionsState(stubCtx(), 'p', 'tpl', continuation);
    const contScreen = cont.getScreen();
    if (contScreen.type !== 'promptRefinement') return assert.fail('expected promptRefinement');
    assert.strictEqual(contScreen.isFirstRound, false, 'continuation rolls roundCount past 1');

    const initial = new GeneratingPromptQuestionsState(stubCtx(), 'p', 'tpl');
    const initialScreen = initial.getScreen();
    if (initialScreen.type !== 'promptRefinement') return assert.fail('expected promptRefinement');
    assert.strictEqual(initialScreen.isFirstRound, true, 'no continuation seeds roundCount=1');
  });
});

suite('Unit: GeneratingPromptQuestionsState — message handlers', () => {
  /**
   * Goal: `answerPromptQuestion` mutates the matching question and broadcasts so the user's
   *   typed answer is visible immediately. Pins that the in-progress state still accepts answers
   *   (the same handler that PromptQuestionsState has — the user can answer mid-stream).
   * Process: construct on the initial path; manually push an active question (since no streaming
   *   has run); send `answerPromptQuestion`; assert the question was updated and broadcast fired.
   */
  test('answerPromptQuestion updates the targeted question and broadcasts', () => {
    const continuation = {
      session: stubSession(),
      messages: [],
      activeQuestions: [makeQuestion(1)],
      nextQuestionId: 2,
      roundCount: 1,
      answers: [],
    };
    const state = new GeneratingPromptQuestionsState(stubCtx(), 'p', 'tpl', continuation);
    const app = stubApp();
    state.handleMessage(app as unknown as App, {
      type: 'answerPromptQuestion',
      questionId: 1,
      textAnswer: 'PostgreSQL',
      chosenIndices: [0],
    });
    const screen = state.getScreen();
    if (screen.type !== 'promptRefinement') return assert.fail('expected promptRefinement');
    assert.strictEqual(screen.questions[0].textAnswer, 'PostgreSQL');
    assert.deepStrictEqual(screen.questions[0].chosenIndices, [0]);
    assert.strictEqual(app.broadcastCalls, 1);
  });

  /**
   * Goal: `generateSpec` while streaming transitions to `WritingSpecState` immediately. Pins
   *   the documented "honored mid-stream" contract — users can bail out of questioning at any
   *   time. The state machine cooperates by aborting its own session before transitioning.
   * Process: construct (initial path); manually attach a stub session; send `generateSpec`;
   *   assert `setState` was called with a `WritingSpecState`.
   */
  test('generateSpec transitions to WritingSpecState mid-stream', () => {
    const state = new GeneratingPromptQuestionsState(stubCtx(), 'Build', 'tpl');
    // Simulate that streaming has begun by attaching a session via the message-handler path
    // (the constructor leaves session=null until startQuestioning runs). We set it here through
    // continuation since that's the only path that pre-installs a session synchronously.
    const stateWithSession = new GeneratingPromptQuestionsState(stubCtx(), 'Build', 'tpl', {
      session: stubSession(),
      messages: [],
      activeQuestions: [],
      nextQuestionId: 0,
      roundCount: 1,
      answers: [],
    });
    const app = stubApp();
    stateWithSession.handleMessage(app as unknown as App, { type: 'generateSpec' });
    assert.strictEqual(app.setStateCalls.length, 1);
    assert.ok(app.setStateCalls[0] instanceof WritingSpecState);
    void state;
  });
});

suite('Unit: GeneratingPromptQuestionsState — interrupt cleanup', () => {
  /**
   * Goal: `interrupt()` aborts the underlying questioning session. Pins the cleanup contract
   *   so a half-streamed agent doesn't keep running after the user navigates away. The temp
   *   spec-template file is also cleaned up via `cleanupSpecTemplateFile` — that side effect
   *   is hard to verify here without filesystem mocks, so we trust the function's own behavior
   *   and pin the abort path explicitly.
   * Process: construct with a continuation containing a session whose abort is spied; call
   *   `interrupt()`; assert the spy fired.
   */
  test('interrupt aborts the questioning session', () => {
    let aborted = false;
    const continuation = {
      session: stubSession(() => (aborted = true)),
      messages: [],
      activeQuestions: [],
      nextQuestionId: 0,
      roundCount: 1,
      answers: [],
    };
    const state = new GeneratingPromptQuestionsState(stubCtx(), 'p', 'tpl', continuation);
    state.interrupt();
    assert.strictEqual(aborted, true);
  });

  /**
   * Goal: after `interrupt()`, subsequent attempts to drive the state should be no-ops — the
   *   `interrupted` flag short-circuits async paths in `streamResponse` / `runRefinement`. We
   *   verify the surface effect: getScreen still returns a refinement screen (no crash) after
   *   interrupt.
   * Process: construct, interrupt, call getScreen; assert it returns a valid screen.
   */
  test('getScreen still returns a valid screen after interrupt', () => {
    const state = new GeneratingPromptQuestionsState(stubCtx(), 'p', 'tpl');
    state.interrupt();
    const screen = state.getScreen();
    assert.strictEqual(screen.type, 'promptRefinement');
  });
});

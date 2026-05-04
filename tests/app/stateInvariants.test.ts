/**
 * State-machine invariant suite. Runs the same set of contract checks across every concrete
 * `AppState` class so that adding a new state automatically gets the same invariants applied
 * as long as you add it to the registry below.
 *
 * Layer: unit (Mocha). Pure construction; no live App, no streaming. Each state is built with
 *   minimal dependencies (stub session, in-memory snapshot manager, etc.).
 * Scope: invariants every state must hold:
 *   1. `getScreen()` doesn't throw on a fresh instance.
 *   2. `getScreen().type` is a valid `AppScreen` discriminant.
 *   3. `interrupt()` is idempotent — calling it twice doesn't throw.
 *   4. `isInteractive()` returns the same value across calls (it's a function, not a getter
 *      that derives from mutable state).
 * Out of scope: state-specific behaviors (those have their own unit tests); transitions
 *   between states (covered by workflow tests).
 */
import * as assert from 'assert';

import type { AppContext, AppState } from '../../src/core/app';
import type { ClaudeSession } from '../../src/core/session';
import { SnapshotManager } from '../../src/core/snapshotManager';
import { EditingState } from '../../src/core/states/editing';
import { EditorReadyState } from '../../src/core/states/editorReady';
import { GeneratingPromptQuestionsState } from '../../src/core/states/generatingPromptQuestions';
import { OnboardingState } from '../../src/core/states/onboarding';
import { PromptState } from '../../src/core/states/prompt';
import { PromptQuestionsState } from '../../src/core/states/promptQuestions';
import { StartingEditorAgentState } from '../../src/core/states/startingEditorAgent';
import { WritingSpecState } from '../../src/core/states/writingSpec';

const VALID_SCREEN_TYPES = new Set([
  'onboarding',
  'prompt',
  'promptRefinement',
  'specEditing',
  'settings',
  'templateEditor',
]);

function stubSession(): ClaudeSession {
  const stub = {
    fork: () => stubSession(),
    abort: () => {},
    getSessionId: () => null,
    prompt: async function* () {},
  };
  return stub as ClaudeSession;
}

function stubCtx(): AppContext {
  return {
    workingDir: '/tmp/blueprint-test',
    createSession: () => stubSession(),
  } as unknown as AppContext;
}

function makeSnapshotManager(): SnapshotManager {
  const mgr = new SnapshotManager();
  mgr.createSnapshot({
    prompt: 'p',
    specContent: '',
    chatMessages: [],
    streamItems: [],
    editingSession: stubSession(),
    submittedFeedback: [],
    pendingFeedback: [],
    questionRounds: [],
  });
  return mgr;
}

interface StateBuilder {
  name: string;
  build(): AppState;
}

const stateBuilders: StateBuilder[] = [
  { name: 'OnboardingState', build: () => new OnboardingState() },
  { name: 'PromptState', build: () => new PromptState(stubCtx()) },
  {
    name: 'PromptQuestionsState',
    build: () => new PromptQuestionsState(stubCtx(), 'p', 'tpl', stubSession(), [], [], 0, 1, 0),
  },
  {
    name: 'GeneratingPromptQuestionsState',
    build: () => new GeneratingPromptQuestionsState(stubCtx(), 'p', 'tpl'),
  },
  {
    name: 'WritingSpecState',
    build: () => new WritingSpecState(stubCtx(), 'p', '', stubSession(), []),
  },
  {
    name: 'StartingEditorAgentState',
    build: () => new StartingEditorAgentState(stubCtx(), 'blueprint/x/plan.md', '# Plan', 'p'),
  },
  {
    name: 'EditorReadyState',
    build: () => new EditorReadyState(stubCtx(), 'blueprint/x/plan.md', makeSnapshotManager(), stubSession()),
  },
  {
    name: 'EditingState',
    build: () => new EditingState(stubCtx(), 'blueprint/x/plan.md', makeSnapshotManager(), stubSession(), 'msg'),
  },
];

suite('Unit: state-machine invariants', () => {
  for (const { name, build } of stateBuilders) {
    /**
     * Goal: `getScreen()` returns a valid AppScreen on a fresh instance and doesn't throw. Pins
     *   the renderable-from-construction contract — every state must be able to describe itself
     *   to the webview the moment the App enters it (the App broadcasts immediately on setState
     *   before onEnter runs, so getScreen has to work without any setup).
     * Process: build a fresh state; call getScreen(); assert it returned and the type is valid.
     */
    test(`${name} — getScreen returns a valid AppScreen on a fresh instance`, () => {
      const state = build();
      const screen = state.getScreen();
      assert.ok(screen, 'getScreen returned falsy');
      assert.ok(VALID_SCREEN_TYPES.has(screen.type), `unknown screen type: ${screen.type}`);
    });

    /**
     * Goal: `interrupt()` is idempotent. Pins the cancellation contract — the App calls interrupt
     *   on setState transitions, and a poorly-written state could double-abort or throw on the
     *   second interrupt.
     * Process: build a fresh state; call interrupt twice; assert no throw.
     */
    test(`${name} — interrupt is idempotent`, () => {
      const state = build();
      assert.doesNotThrow(() => {
        state.interrupt();
        state.interrupt();
      });
    });

    /**
     * Goal: `isInteractive()` returns the same value across calls. Pins that the result is a
     *   property of the *state class*, not derived from mutable instance state — App's rate-limit
     *   recovery reads this multiple times and would behave erratically if it changed.
     * Process: build a fresh state; call isInteractive() three times; assert all returns equal.
     */
    test(`${name} — isInteractive is consistent across calls`, () => {
      const state = build();
      const a = state.isInteractive();
      const b = state.isInteractive();
      const c = state.isInteractive();
      assert.strictEqual(a, b);
      assert.strictEqual(b, c);
    });
  }
});

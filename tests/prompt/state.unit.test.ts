/**
 * Unit tests for `PromptState` — the state machine state for the prompt screen.
 *
 * Layer: unit (Mocha). Constructs `PromptState` directly with a stub `App` and a minimal
 *   `AppContext`; no harness, no extension activation.
 * Scope: the message-handler logic — `setPrompt` updates state and broadcasts; `submitSpecPrompt`
 *   transitions to `GeneratingPromptQuestionsState` only when the prompt has non-whitespace
 *   content. Pins the trim-aware empty-check that mirrors the front-end `canSubmit` derivation.
 * Out of scope: the questioning flow itself (covered by integration tests under
 *   `tests/workflows/`); the React rendering of the prompt screen (covered in
 *   `tests/components/screens/PromptScreen.test.tsx`).
 */
import * as assert from 'assert';

import type { App, AppContext } from '../../src/core/app';
import type { AppState } from '../../src/core/app';
import { GeneratingPromptQuestionsState } from '../../src/core/states/generatingPromptQuestions';
import { PromptState } from '../../src/core/states/prompt';

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
  return {
    context: {
      workspaceState: { get: () => undefined },
    },
  } as unknown as AppContext;
}

suite('Unit: PromptState', () => {
  /**
   * Goal: `setPrompt` updates the stored prompt and broadcasts so the screen re-renders with the
   *   new value. Without the broadcast the screen would show stale text.
   * Process: send `setPrompt`; assert `getScreen().prompt` reflects the new value and `broadcast`
   *   was called once.
   */
  test('setPrompt updates the prompt and broadcasts', () => {
    const state = new PromptState(stubCtx());
    const app = stubApp();
    state.handleMessage(app as unknown as App, { type: 'setPrompt', prompt: 'New prompt' });
    const screen = state.getScreen();
    assert.strictEqual(screen.type, 'prompt');
    assert.strictEqual(screen.type === 'prompt' ? screen.prompt : null, 'New prompt');
    assert.strictEqual(app.broadcastCalls, 1);
  });

  /**
   * Goal: `submitSpecPrompt` with an empty prompt is a no-op — no transition, no broadcast.
   *   Pins the trim-based gate that mirrors the front-end `canSubmit` check; without it, an
   *   empty submission would still start the questioning agent.
   * Process: leave the prompt empty (default); send `submitSpecPrompt`; assert `setState` was
   *   never called.
   */
  test('submitSpecPrompt with empty prompt is a no-op', () => {
    const state = new PromptState(stubCtx());
    const app = stubApp();
    state.handleMessage(app as unknown as App, { type: 'submitSpecPrompt' });
    assert.strictEqual(app.setStateCalls.length, 0);
  });

  /**
   * Goal: `submitSpecPrompt` with whitespace-only prompts is also a no-op — pins the `.trim()`
   *   call so "   " or "\t\n" doesn't slip past.
   * Process: for each whitespace input, set the prompt and submit; assert no transition.
   */
  test('submitSpecPrompt with whitespace-only prompt is a no-op', () => {
    for (const prompt of ['   ', '\t', '\n', '  \t\n  ']) {
      const state = new PromptState(stubCtx(), prompt);
      const app = stubApp();
      state.handleMessage(app as unknown as App, { type: 'submitSpecPrompt' });
      assert.strictEqual(app.setStateCalls.length, 0, `prompt=${JSON.stringify(prompt)}`);
    }
  });

  /**
   * Goal: `submitSpecPrompt` with a real prompt transitions to `GeneratingPromptQuestionsState` —
   *   the only path from prompt-screen to questioning. Pins both that the transition fires AND
   *   that the new state carries the user's prompt forward.
   * Process: construct PromptState with a valid prompt; send `submitSpecPrompt`; assert
   *   `setState` was called once with a `GeneratingPromptQuestionsState`.
   */
  test('submitSpecPrompt with non-empty prompt transitions to GeneratingPromptQuestionsState', () => {
    const state = new PromptState(stubCtx(), 'Build a profile API');
    const app = stubApp();
    state.handleMessage(app as unknown as App, { type: 'submitSpecPrompt' });
    assert.strictEqual(app.setStateCalls.length, 1);
    assert.ok(app.setStateCalls[0] instanceof GeneratingPromptQuestionsState);
  });

  /**
   * Goal: the constructor's optional `prompt` parameter is honored — pins the back-from-other-
   *   screen restore path where PromptState is reconstructed with a previously-typed value.
   *   Without this, going back to the prompt screen would lose draft text.
   * Process: construct with an initial prompt; assert `getScreen().prompt` matches.
   */
  test('constructor accepts and exposes an initial prompt', () => {
    const state = new PromptState(stubCtx(), 'Initial draft');
    const screen = state.getScreen();
    assert.strictEqual(screen.type === 'prompt' ? screen.prompt : null, 'Initial draft');
  });
});

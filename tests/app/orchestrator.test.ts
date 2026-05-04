/**
 * Integration tests for `App` — the central orchestrator that owns the active state, the view
 * stack, the data-broadcast pipeline, and the rate-limit recovery path.
 *
 * Layer: integration (Extension Host + Mocha + harness). Drives the live App via the test API
 *   exposed from `extension.activate()` so we exercise real state/view classes. Sessions are
 *   replaced with `FakeSessionFactory` so no Claude calls happen.
 * Scope: viewStack push/pop (openSettings, openTemplateEditor, returnFromView), broadcast
 *   ordering (setState fires broadcast before onEnter), addDataListener subscribe/unsubscribe,
 *   freshSpecEntry one-shot flag, rate-limit recovery to the last interactive state, error-shape
 *   passthrough, isSessionActive gate.
 * Out of scope: per-state handler logic (covered by each state's unit test); message routing
 *   into states (covered by the workflow tests).
 */
import * as assert from 'assert';

import type { AppState } from '../../src/core/app';
import type { ExtensionData } from '../../src/types/data';
import { resetExtensionState, setupHarness, waitFor } from '../helpers/harness';

/**
 * Minimal non-interactive stub state. Used to drive transitions where we just need a
 * specEditing-shaped getScreen without side effects (no streaming, no fs writes, no transitions
 * to EditorReadyState). Pins the orchestrator behavior independently of any specific concrete
 * state's onEnter chain.
 */
function makeStubSpecEditingState(): AppState {
  return {
    handleMessage: () => {},
    interrupt: () => {},
    isInteractive: () => false,
    getScreen: () => ({
      type: 'specEditing',
      specFilePath: 'blueprint/test/plan.md',
      prompt: 'p',
      streamItems: [],
      messageDraft: '',
      feedbackItems: [],
      nFeedback: 0,
      editorAgent: { working: true, phase: 'reviewing_plan' },
      questionsAgent: { working: true, phase: 'waiting_for_plan_review' },
    }),
  };
}

async function arrangeAtPromptScreen(h: Awaited<ReturnType<typeof setupHarness>>): Promise<void> {
  await resetExtensionState(h.app);
  // The live App is shared across tests. Pop any view stack left by a prior test (e.g. settings
  // or template editor overlay) by sending returnFromView until further pops are no-ops.
  for (let i = 0; i < 5; i++) {
    h.send({ type: 'returnFromView' });
  }
  // Drive into PromptState via the public app API: resetOnboarding → OnboardingState, then
  // completeOnboarding → PromptState. This ensures the resulting state instance is the same
  // PromptState class the bundled extension references, so `app instanceof PromptState` checks
  // (used by App.isSessionActive) work across the test/dist module boundary.
  await h.app.resetOnboarding();
  await waitFor(
    () => {
      const last = h.latest();
      return last?.status === 'ok' && last.screen.type === 'onboarding' ? true : null;
    },
    2000,
    'onboarding screen',
  );
  h.send({ type: 'completeOnboarding' });
  await waitFor(
    () => {
      const last = h.latest();
      return last?.status === 'ok' && last.screen.type === 'prompt' ? true : null;
    },
    2000,
    'prompt screen current',
  );
}

suite('Integration: App — view stack', () => {
  /**
   * Goal: `openSettings` pushes a SettingsView onto the stack and the next broadcast renders the
   *   settings screen — even though the underlying state is unchanged. Pins the "view overlays
   *   state" model: views are transient, state survives.
   * Process: arrange the App at PromptState; send `openSettings`; wait for a `settings` screen.
   */
  test('openSettings overlays the state with a settings view', async () => {
    const h = await setupHarness();
    try {
      await arrangeAtPromptScreen(h);
      h.send({ type: 'openSettings' });
      const settings = await waitFor(() => h.screenOfType('settings'), 1000, 'settings broadcast');
      assert.strictEqual(settings.type, 'settings');
    } finally {
      h.dispose();
    }
  });

  /**
   * Goal: `returnFromView` pops the top view, exposing whatever was underneath. From a settings
   *   overlay over a prompt state, returnFromView reveals the prompt screen again. Pins the pop
   *   semantics so users can back out without losing state.
   * Process: open settings; send returnFromView; assert next broadcast is the prompt screen.
   */
  test('returnFromView pops the view back to the underlying state', async () => {
    const h = await setupHarness();
    try {
      await arrangeAtPromptScreen(h);
      h.send({ type: 'openSettings' });
      await waitFor(() => h.screenOfType('settings'));

      const before = h.broadcasts.length;
      h.send({ type: 'returnFromView' });
      await waitFor(() => h.broadcasts.length > before && h.latest()?.status === 'ok');
      const last = h.latest();
      assert.ok(last && last.status === 'ok' && last.screen.type === 'prompt');
    } finally {
      h.dispose();
    }
  });

  /**
   * Goal: `openTemplateEditor` pushes a TemplateEditorView on top of an existing view, allowing
   *   settings → new-template-editor → back-to-settings navigation. Pins the stack semantics
   *   (push, not replace) so the user keeps their settings context.
   * Process: open settings; open template editor; assert templateEditor screen is current; pop;
   *   assert settings is back.
   */
  test('openTemplateEditor pushes onto an existing view stack and pops back to it', async () => {
    const h = await setupHarness();
    try {
      await arrangeAtPromptScreen(h);
      h.send({ type: 'openSettings' });
      await waitFor(() => h.screenOfType('settings'));

      h.send({ type: 'openTemplateEditor', templateId: undefined });
      const editor = await waitFor(() => h.screenOfType('templateEditor'));
      assert.strictEqual(editor.type, 'templateEditor');

      const before = h.broadcasts.length;
      h.send({ type: 'returnFromView' });
      await waitFor(() => h.broadcasts.length > before);
      const last = h.latest();
      assert.ok(last && last.status === 'ok' && last.screen.type === 'settings', 'pop should reveal settings again');
    } finally {
      h.dispose();
    }
  });
});

suite('Integration: App — addDataListener', () => {
  /**
   * Goal: the unsubscribe callback returned by `addDataListener` actually stops further
   *   notifications. Pins the lifecycle so tests (and consumers like the SidebarProvider) can
   *   detach without leaking. Without this, broadcasts would accumulate listeners across test
   *   runs.
   * Process: subscribe a counter; broadcast (via requestData); unsubscribe; broadcast again;
   *   assert the counter only saw the first broadcast.
   */
  test('returned unsubscribe stops further notifications', async () => {
    const h = await setupHarness();
    try {
      await arrangeAtPromptScreen(h);

      let count = 0;
      const unsub = h.app.addDataListener(() => {
        count++;
      });

      h.send({ type: 'requestData' });
      await waitFor(() => count > 0);
      const afterFirst = count;
      unsub();

      h.send({ type: 'requestData' });
      // Wait briefly for any potential broadcast; the live broadcast lands quickly.
      await new Promise((r) => setTimeout(r, 50));
      assert.strictEqual(count, afterFirst, 'unsubscribed listener should see no further broadcasts');
    } finally {
      h.dispose();
    }
  });
});

suite('Integration: App — freshSpecEntry flag', () => {
  /**
   * Goal: when the App transitions from a non-specEditing screen to a specEditing screen, the
   *   first broadcast carries `freshEntry: true`; subsequent broadcasts on the same state carry
   *   `freshEntry: false` (or undefined). Pins the one-shot flag the SpecEditingScreen uses to
   *   reset the active tab to "chat" only on a fresh entry, not on every re-render.
   * Process: from PromptState, transition into a stub StartingEditorAgentState (which renders a
   *   specEditing screen); inspect the next broadcast for freshEntry; trigger another broadcast
   *   via requestData; assert freshEntry is no longer true.
   */
  test('freshEntry is true on the first specEditing broadcast and clears afterwards', async () => {
    const h = await setupHarness();
    try {
      await arrangeAtPromptScreen(h);

      // Manually push into specEditing via setState using a stub — avoids the real
      // StartingEditorAgent's onEnter chain (which immediately transitions to EditorReadyState
      // and dirties the live App's lastInteractiveState).
      h.app.setState(makeStubSpecEditingState());

      const first = await waitFor(() => h.screenOfType('specEditing'));
      assert.strictEqual(first.freshEntry, true);

      // Trigger another broadcast on the same state — freshEntry should not persist.
      const beforeReBroadcast = h.broadcasts.length;
      h.send({ type: 'requestData' });
      await waitFor(() => h.broadcasts.length > beforeReBroadcast);
      const last = h.latest();
      if (!last || last.status !== 'ok' || last.screen.type !== 'specEditing') {
        return assert.fail('expected specEditing broadcast');
      }
      assert.notStrictEqual(last.screen.freshEntry, true, 'freshEntry should be cleared on subsequent broadcasts');

      const { PromptState } = await import('../../src/core/states/prompt');
      h.app.setState(new PromptState(h.app.ctx));
    } finally {
      h.dispose();
    }
  });
});

suite('Integration: App — rate limit recovery', () => {
  /**
   * Goal: `onRateLimit` snaps back to the *last interactive state* and surfaces `rateLimitResetsAt`
   *   in the data envelope. Pins the recovery path so a 429 mid-streaming returns the user to a
   *   working screen with the banner showing.
   * Process: drive the App into a non-interactive state (StartingEditorAgentState — isInteractive
   *   returns false); call onRateLimit with a fixed timestamp; assert the next broadcast has
   *   `rateLimitResetsAt` and the screen is back to the prompt (the last interactive state).
   */
  test('onRateLimit returns to the last interactive state and surfaces resetsAt', async () => {
    const h = await setupHarness();
    try {
      await arrangeAtPromptScreen(h);

      h.app.setState(makeStubSpecEditingState());
      await waitFor(() => h.screenOfType('specEditing'));

      const before = h.broadcasts.length;
      h.app.onRateLimit(1234567890);
      await waitFor(() => h.broadcasts.length > before);
      const last = h.latest();
      if (!last || last.status !== 'ok') return assert.fail('expected ok broadcast');
      assert.strictEqual(last.rateLimitResetsAt, 1234567890);
      assert.strictEqual(last.screen.type, 'prompt', 'should snap back to last interactive (PromptState)');
    } finally {
      h.dispose();
    }
  });
});

suite('Integration: App — error shape', () => {
  /**
   * Goal: a healthy app reports `status: "ok"`. Pins the inverse witness for the error path —
   *   when Claude can't be found or there's no workspace folder, the App constructor records an
   *   error and getData returns an `error` envelope, but in the test workspace those preconditions
   *   are satisfied so we should always see `ok`.
   * Process: trigger a broadcast; assert status is "ok".
   */
  test('healthy harness reports status="ok"', async () => {
    const h = await setupHarness();
    try {
      await arrangeAtPromptScreen(h);
      h.send({ type: 'requestData' });
      await waitFor(() => h.latest()?.status === 'ok');
      const last = h.latest() as ExtensionData;
      assert.strictEqual(last.status, 'ok');
    } finally {
      h.dispose();
    }
  });
});

suite('Integration: App — isSessionActive', () => {
  /**
   * Goal: `isSessionActive()` returns false on Onboarding / Prompt and true on any other state.
   *   Pins the gate that controls the warning dialog when the user clicks "New plan" — without
   *   it, the dialog would either always pop (annoying) or never (data loss).
   * Process: assert false at PromptState; transition to a spec-editing-shaped state; assert true.
   */
  test('returns false at Prompt; true at any non-Prompt/Onboarding state', async () => {
    const h = await setupHarness();
    try {
      await arrangeAtPromptScreen(h);
      assert.strictEqual(h.app.isSessionActive(), false);

      h.app.setState(makeStubSpecEditingState());
      await waitFor(() => h.screenOfType('specEditing'));
      assert.strictEqual(h.app.isSessionActive(), true);
    } finally {
      h.dispose();
    }
  });
});

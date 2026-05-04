/**
 * Workflow test for the editor warmup phase that runs after the user picks an existing plan file.
 *
 * Layer: integration (Extension Host + harness + fake `ClaudeSession`).
 * Scope: drive `StartingEditorAgentState` directly (bypasses the file picker since it's interactive),
 *   script a complete warmup stream, and assert the state machine reaches `EditorReady`. Pins the
 *   contract that warmup is exactly one prompt on an "Editor agent" session and creates a separate
 *   "Editor questions" session at the end.
 * Out of scope: the file picker dialog itself, real plan content interpretation by Claude.
 */
import * as assert from 'assert';

import { StartingEditorAgentState } from '../../src/core/states/startingEditorAgent';
import { assistantText, resultDone, systemInit } from '../helpers/fakeSession';
import { resetExtensionState, setupHarness, waitFor } from '../helpers/harness';

suite('Workflow: open existing plan', () => {
  /**
   * Goal: verify the "open existing plan" warmup phase. After picking a markdown file, the editor
   *   agent does one warmup prompt (reads the plan, scopes the codebase) and then transitions to the
   *   ready state. A separate questions session is created at the end of warmup.
   * Process: arrange post-onboarding state; script the fake session with a complete warmup stream
   *   (system-init → assistant text → result-done); bypass the file picker by constructing
   *   `StartingEditorAgentState` directly with synthetic file path/content; wait for the
   *   spec-editing screen with `editorAgent.phase === 'ready'`; assert exactly one warmup prompt
   *   was sent on an "Editor agent" session and one "Editor questions" session was created.
   */
  test('warmup transitions starting → editor ready', async () => {
    const h = await setupHarness();
    try {
      await resetExtensionState(h.app);
      await h.app.ctx.context.globalState.update('blueprint.onboardingComplete', true);

      // Editor warmup runs one prompt() that reads the plan and scopes the codebase.
      // Script a simple successful response so the loop terminates.
      h.fakes.script([systemInit('warmup-1'), assistantText('Reviewed the plan.', 'warmup-1'), resultDone('warmup-1')]);

      // Bypass the file picker: drive the flow directly, same as App.handleOpenExistingSpec
      // would do after the user picked a file.
      h.app.setState(
        new StartingEditorAgentState(h.app.ctx, 'blueprint/test-feature/plan.md', '# Test plan\n\nSome content.', ''),
      );

      // Warmup is async; wait for the questionsAgent.phase to flip out of waiting_for_plan_review,
      // which only happens after the transition to EditorReady.
      const ready = await waitFor(
        () => {
          const screen = h.screenOfType('specEditing');
          return screen && screen.editorAgent.phase === 'ready' ? screen : null;
        },
        3000,
        'editor ready phase',
      );

      assert.strictEqual(ready.editorAgent.working, false);
      assert.strictEqual(ready.editorAgent.phase, 'ready');
      assert.strictEqual(ready.specFilePath, 'blueprint/test-feature/plan.md');

      // The fake editor session was created and prompted exactly once for warmup.
      const editorSessions = h.fakes.created.filter((s) => s.name === 'Editor agent');
      assert.strictEqual(editorSessions.length, 1, 'expected one Editor agent session');
      assert.strictEqual(editorSessions[0].prompts.length, 1, 'expected one warmup prompt');

      // A questions session was created at the end of warmup.
      const questionsSessions = h.fakes.created.filter((s) => s.name === 'Editor questions');
      assert.strictEqual(questionsSessions.length, 1, 'expected one Editor questions session');
    } finally {
      h.dispose();
    }
  });
});

/**
 * Workflow test for the `blueprint.resetOnboarding` command.
 *
 * Layer: integration (Extension Host + harness). Invokes the command via
 *   `vscode.commands.executeCommand` — the same code path as the command-palette
 *   entry — so wiring is exercised end-to-end.
 * Scope: from a post-onboarding state, reset wipes the completion flag and the
 *   user's saved plan templates, then returns the UI to the onboarding screen.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';

import { resetExtensionState, setupHarness, waitFor } from '../helpers/harness';

suite('Workflow: reset onboarding', () => {
  /**
   * Goal: verify the "Reset onboarding" command takes the user from a post-onboarding state back to
   *   the onboarding wizard, wiping the saved completion flag and the user's saved plan templates
   *   (the `blueprint.promptTemplates` array in global VS Code settings).
   * Process: arrange a post-onboarding state (set the flag, persist a fake template); invoke
   *   `blueprint.resetOnboarding` via `vscode.commands.executeCommand` (same code path as the
   *   command-palette entry); wait for the onboarding screen; assert the flag is cleared and the
   *   templates array is empty.
   */
  test('reset command clears flag and templates and returns to onboarding', async () => {
    const h = await setupHarness();
    try {
      // Arrange: pretend onboarding has already happened.
      await resetExtensionState(h.app);
      await h.app.ctx.context.globalState.update('blueprint.onboardingComplete', true);
      await vscode.workspace
        .getConfiguration('blueprint')
        .update(
          'promptTemplates',
          [{ id: 'x', name: 'X', filename: 'plan.md', mode: 'freeform', prompt: 'p' }],
          vscode.ConfigurationTarget.Global,
        );

      await vscode.commands.executeCommand('blueprint.resetOnboarding');

      await waitFor(() => h.screenOfType('onboarding'), 2000, 'onboarding screen after reset');

      const flag = h.app.ctx.context.globalState.get<boolean>('blueprint.onboardingComplete');
      assert.strictEqual(flag, undefined, 'onboardingComplete flag should be cleared');

      const templates = vscode.workspace.getConfiguration('blueprint').get<unknown[]>('promptTemplates') ?? [];
      assert.strictEqual(templates.length, 0, 'templates should be cleared after reset');
    } finally {
      h.dispose();
    }
  });
});

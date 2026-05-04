/**
 * Workflow test for the model selector during onboarding.
 *
 * Layer: integration (Extension Host + harness). `setModel` writes through the
 *   real `vscode.workspace.getConfiguration` API, so it can't be unit-tested
 *   without VS Code; lives here rather than in `state.unit.test.ts`.
 * Scope: send `setModel`, assert the chosen model appears on the onboarding
 *   screen and is persisted to the global `blueprint.model` setting.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';

import { resetExtensionState, setupHarness, waitFor } from '../helpers/harness';

async function arrangeFreshOnboarding(h: Awaited<ReturnType<typeof setupHarness>>) {
  await resetExtensionState(h.app);
  await h.app.resetOnboarding();
  await waitFor(() => h.screenOfType('onboarding'), 2000, 'onboarding screen');
}

suite('Workflow: onboarding setModel', () => {
  /**
   * Goal: confirm that selecting a different model in the onboarding screen reaches (a) the screen
   *   state — so the radio updates immediately — and (b) the persisted global config at
   *   `blueprint.model`, which is what every other part of the extension reads via `getModel()`.
   *   Persistence is what makes the choice survive VS Code reloads/restarts and be honored by
   *   later code paths (questioning, plan generation, editing).
   *   Out of scope here: whether the model survives reset onboarding (that's a separate
   *   contract — reset clears the flag and templates but not the model — covered separately).
   * Process: arrange a fresh onboarding screen; read the model enum dynamically from `package.json`
   *   so the test follows future model changes; pick any non-default model; send `setModel`; wait
   *   for `selectedModel` on screen to match; assert the persisted `blueprint.model` config matches;
   *   clean up by clearing the global model override.
   */
  test('setModel persists to global config and updates selectedModel on screen', async () => {
    const h = await setupHarness();
    try {
      await arrangeFreshOnboarding(h);

      const ext = vscode.extensions.getExtension('Imbue.imbue-blueprint')!;
      const enums = ext.packageJSON.contributes.configuration[0].properties['blueprint.model'].enum as string[];
      const currentDefault = ext.packageJSON.contributes.configuration[0].properties['blueprint.model']
        .default as string;
      const otherModel = enums.find((m) => m !== currentDefault);
      assert.ok(otherModel, 'expected at least two model options to exist');

      h.send({ type: 'setModel', model: otherModel });
      await waitFor(
        () => (h.screenOfType('onboarding')?.selectedModel === otherModel ? true : null),
        2000,
        'selectedModel updated on screen',
      );
      assert.strictEqual(
        vscode.workspace.getConfiguration('blueprint').get<string>('model'),
        otherModel,
        'model setting should persist to global config',
      );

      // Restore default to keep Global config clean across runs.
      await vscode.workspace
        .getConfiguration('blueprint')
        .update('model', undefined, vscode.ConfigurationTarget.Global);
    } finally {
      h.dispose();
    }
  });
});

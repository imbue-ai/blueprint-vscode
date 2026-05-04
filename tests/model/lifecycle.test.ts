/**
 * Lifecycle tests for the `blueprint.model` global config setting.
 *
 * Layer: integration (Extension Host + harness). Drives the real config write/read paths.
 * Scope: documents the full lifecycle of the model setting:
 *   - what *sets* it: the SettingsView's `setModel` handler (the onboarding handler is covered in
 *     `tests/onboarding/setModel.test.ts`)
 *   - when it's *persisted*: every `setModel` write goes to global config (survives reloads,
 *     restarts, and reset onboarding)
 *   - what *clears* it: nothing automatic — the user clears it via VS Code Settings UI or by
 *     directly editing config. Reset onboarding does NOT clear it.
 *   - what *reads* it: the onboarding screen's `selectedModel` reflects whatever is in config
 *     (rather than always defaulting to package.json's default).
 * Out of scope: onboarding's setModel handler (in onboarding/setModel.test.ts) and the read paths
 *   used by Claude sessions (those resolve `getModel()` at session-creation time and are exercised
 *   indirectly via workflow tests for the questioning/editing flows).
 */
import * as assert from 'assert';
import * as vscode from 'vscode';

import { resetExtensionState, setupHarness, waitFor } from '../helpers/harness';

function readModelEnum(): { values: string[]; defaultValue: string; nonDefault: string } {
  const ext = vscode.extensions.getExtension('Imbue.imbue-blueprint')!;
  const prop = ext.packageJSON.contributes.configuration[0].properties['blueprint.model'];
  const values = prop.enum as string[];
  const defaultValue = prop.default as string;
  const nonDefault = values.find((m) => m !== defaultValue);
  if (!nonDefault) throw new Error('expected at least two model options to exist');
  return { values, defaultValue, nonDefault };
}

async function clearModelOverride() {
  await vscode.workspace.getConfiguration('blueprint').update('model', undefined, vscode.ConfigurationTarget.Global);
}

suite('Model: lifecycle', () => {
  /**
   * Goal: pin the second write path. The Settings view also exposes a model selector — sending
   *   `setModel` from the Settings screen must persist to the same `blueprint.model` global config
   *   that the onboarding handler writes to. Otherwise the two surfaces could drift.
   * Process: complete onboarding to leave OnboardingState; open the Settings view via the
   *   `blueprint.openSettings` command; wait for the settings screen; pick a non-default model
   *   from the package.json enum; send `setModel`; assert the persisted config matches; clean up.
   */
  test('setModel from the Settings view persists to global config', async () => {
    const h = await setupHarness();
    try {
      await resetExtensionState(h.app);
      await h.app.resetOnboarding();
      await waitFor(() => h.screenOfType('onboarding'), 2000, 'onboarding screen');
      h.send({ type: 'completeOnboarding' });
      await waitFor(() => h.screenOfType('prompt'), 2000, 'prompt screen');

      await vscode.commands.executeCommand('blueprint.openSettings');
      await waitFor(() => h.screenOfType('settings'), 2000, 'settings screen');

      const { nonDefault } = readModelEnum();
      h.send({ type: 'setModel', model: nonDefault });
      await waitFor(
        () => (h.screenOfType('settings')?.selectedModel === nonDefault ? true : null),
        2000,
        'selectedModel updated on settings screen',
      );
      assert.strictEqual(
        vscode.workspace.getConfiguration('blueprint').get<string>('model'),
        nonDefault,
        'model setting should persist to global config',
      );

      await clearModelOverride();
    } finally {
      h.dispose();
    }
  });

  /**
   * Goal: pin the asymmetry that "reset onboarding" wipes the completion flag and the saved plan
   *   templates but does **not** clear the model. A user who carefully picked Opus once and then
   *   resets onboarding for any reason should keep their model choice.
   * Process: reset to a clean baseline; write a non-default model directly into global config
   *   (avoids relying on the onboarding setModel path, which is covered elsewhere); invoke
   *   `blueprint.resetOnboarding`; wait for the onboarding screen; assert `blueprint.model` is
   *   unchanged in global config; assert the onboarding screen's `selectedModel` reflects it
   *   (read-path proof in the same test).
   */
  test('reset onboarding does NOT clear blueprint.model', async () => {
    const h = await setupHarness();
    try {
      await resetExtensionState(h.app);

      const { nonDefault } = readModelEnum();
      await vscode.workspace
        .getConfiguration('blueprint')
        .update('model', nonDefault, vscode.ConfigurationTarget.Global);

      await vscode.commands.executeCommand('blueprint.resetOnboarding');
      await waitFor(() => h.screenOfType('onboarding'), 2000, 'onboarding screen after reset');

      assert.strictEqual(
        vscode.workspace.getConfiguration('blueprint').get<string>('model'),
        nonDefault,
        'blueprint.model should survive reset onboarding',
      );
      assert.strictEqual(
        h.screenOfType('onboarding')?.selectedModel,
        nonDefault,
        'onboarding selectedModel should reflect the surviving global config',
      );

      await clearModelOverride();
    } finally {
      h.dispose();
    }
  });

  /**
   * Goal: pin the read path. The onboarding screen's `selectedModel` is whatever `getModel()`
   *   returns from global config — not always the package.json default. A user who already has a
   *   non-default model set should see it pre-selected when onboarding opens.
   * Process: write a non-default model into global config; reset to a fresh onboarding screen;
   *   assert the onboarding screen's `selectedModel` matches the config value (proves the read
   *   path goes through `getModel()` and not a hardcoded default); clean up.
   */
  test('initial onboarding screen reflects the current global model config', async () => {
    const h = await setupHarness();
    try {
      await resetExtensionState(h.app);

      const { nonDefault } = readModelEnum();
      await vscode.workspace
        .getConfiguration('blueprint')
        .update('model', nonDefault, vscode.ConfigurationTarget.Global);

      await h.app.resetOnboarding();
      await waitFor(() => h.screenOfType('onboarding'), 2000, 'onboarding screen');

      assert.strictEqual(
        h.screenOfType('onboarding')?.selectedModel,
        nonDefault,
        'onboarding selectedModel should reflect global config, not the package.json default',
      );

      await clearModelOverride();
    } finally {
      h.dispose();
    }
  });
});

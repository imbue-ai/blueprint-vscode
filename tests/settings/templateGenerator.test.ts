/**
 * Integration tests for `core/templateGenerator.ts` — generates the user's first ("Default")
 * template at the end of onboarding and writes it to global config.
 *
 * Layer: integration (Extension Host + Mocha). Real `vscode.workspace.getConfiguration` writes;
 *   no mocking.
 * Scope: `generateDefaultTemplate` writes a single-template array to `blueprint.promptTemplates`,
 *   shaped as a `PromptTemplate` with structured mode, plan.md filename, name "Default", and a
 *   prompt rebuilt from the supplied config. Existing templates are *replaced* (the current
 *   contract is "Default replaces", not "append"). Pins those because onboarding calls this
 *   exactly once per reset.
 * Out of scope: SettingsView (own test); buildPromptFromConfig content (a value, not behavior).
 */
import * as assert from 'assert';
import * as vscode from 'vscode';

import { generateDefaultTemplate } from '../../src/core/templateGenerator';
import type { TemplateConfig } from '../../src/types/onboarding';
import type { PromptTemplate } from '../../src/types/promptTemplate';

async function clearTemplates(): Promise<void> {
  await vscode.workspace
    .getConfiguration('blueprint')
    .update('promptTemplates', undefined, vscode.ConfigurationTarget.Global);
}

function readTemplates(): PromptTemplate[] {
  return vscode.workspace.getConfiguration('blueprint').get<PromptTemplate[]>('promptTemplates') ?? [];
}

const config: TemplateConfig = {
  sections: [{ id: 's1', title: 'Overview', description: 'Describe the feature' }],
  styles: ['bullet'],
  depth: 'concise',
  notes: 'BE BRIEF',
};

suite('Integration: generateDefaultTemplate', () => {
  teardown(async () => {
    await clearTemplates();
  });

  /**
   * Goal: writes a single template to `blueprint.promptTemplates` with the canonical "Default"
   *   shape — name "Default", filename `plan.md`, mode structured, config matching the input,
   *   and a prompt rebuilt via `buildPromptFromConfig` (so the user's notes/sections/styles
   *   actually inform the agent). Pins the onboarding-final write that bootstraps the user's
   *   first template.
   * Process: clear templates; call generateDefaultTemplate with the config; assert the stored
   *   template's shape and that the prompt body includes the user's notes.
   */
  test('writes a "Default" template with structured mode and rebuilt prompt', async () => {
    await clearTemplates();
    await generateDefaultTemplate(config);
    const stored = readTemplates();
    assert.strictEqual(stored.length, 1);
    const t = stored[0];
    assert.strictEqual(t.name, 'Default');
    assert.strictEqual(t.filename, 'plan.md');
    assert.strictEqual(t.mode, 'structured');
    assert.deepStrictEqual(t.config.sections, config.sections);
    assert.ok(typeof t.id === 'string' && t.id.length > 0, 'id should be a fresh non-empty string');
    assert.ok(t.prompt.includes('BE BRIEF'), 'prompt should be rebuilt from config and include notes');
  });

  /**
   * Goal: subsequent calls *replace* the template list rather than append (the function writes
   *   `[template]`, not `[...existing, template]`). Pins the "onboarding overwrites" contract,
   *   which is what reset-onboarding relies on to give the user a fresh single-template slate.
   * Process: pre-seed two unrelated templates; call generateDefaultTemplate; assert the result
   *   is a single-element array with the new "Default".
   */
  test('replaces any existing templates with a single Default', async () => {
    await vscode.workspace.getConfiguration('blueprint').update(
      'promptTemplates',
      [
        { ...config, id: 'old-a', name: 'Old A', filename: 'a.md', mode: 'freeform', prompt: 'A', config },
        { ...config, id: 'old-b', name: 'Old B', filename: 'b.md', mode: 'freeform', prompt: 'B', config },
      ],
      vscode.ConfigurationTarget.Global,
    );
    await generateDefaultTemplate(config);
    const stored = readTemplates();
    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0].name, 'Default');
  });
});

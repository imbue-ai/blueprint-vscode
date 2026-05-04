/**
 * Integration tests for `core/prompts.ts` template validation rules — the filters
 * `getTemplates()` applies to whatever shape lives in the user's `blueprint.promptTemplates`
 * config.
 *
 * Layer: integration (Extension Host + Mocha). `getTemplates()` reads from
 *   `vscode.workspace.getConfiguration('blueprint').promptTemplates`, so we seed config and
 *   verify `normalizeTemplate`'s filter behavior end-to-end.
 * Scope: id-presence requirement, empty-prompt acceptance, defensive handling of malformed
 *   entries. These rules govern what shows up in the Settings template list.
 * Out of scope: SettingsView (own test); template CRUD via TemplateEditorView (own test).
 */
import * as assert from 'assert';
import * as vscode from 'vscode';

import { getTemplates } from '../../src/core/prompts';

async function setRawTemplates(value: unknown[]): Promise<void> {
  await vscode.workspace
    .getConfiguration('blueprint')
    .update('promptTemplates', value, vscode.ConfigurationTarget.Global);
}

async function clearTemplates(): Promise<void> {
  await vscode.workspace
    .getConfiguration('blueprint')
    .update('promptTemplates', undefined, vscode.ConfigurationTarget.Global);
}

const validShape = {
  id: 'tpl-1',
  name: 'Plan',
  prompt: 'body',
  filename: 'plan.md',
  mode: 'structured',
  config: { sections: [], styles: ['bullet'], depth: 'concise', notes: '' },
};

suite('Integration: prompts.ts template validation', () => {
  teardown(async () => {
    await clearTemplates();
  });

  /**
   * Goal: templates without a string `id` are filtered out. Pins the id-required contract — the
   *   selectedTemplateId workspace state and every CRUD operation key off `id`, so an entry
   *   without one would dangle (selectable but never persistable).
   * Process: seed config with a template whose `id` is missing; assert getTemplates returns 0.
   */
  test('drops templates without an id field', async () => {
    const noId = { ...validShape };
    delete (noId as Partial<typeof validShape>).id;
    await setRawTemplates([noId]);
    assert.strictEqual(getTemplates().length, 0);
  });

  /**
   * Goal: templates with an empty `prompt` are still accepted. Pins the lenient body rule —
   *   freeform-mode users can save a template while still typing the body, and structured-mode
   *   templates derive their prompt from the config so the stored body doesn't have to be
   *   non-empty.
   * Process: seed config with a template whose `prompt` is `''`; assert getTemplates returns 1.
   */
  test('accepts templates with an empty prompt body', async () => {
    await setRawTemplates([{ ...validShape, prompt: '' }]);
    assert.strictEqual(getTemplates().length, 1);
  });

  /**
   * Goal: malformed entries (non-objects, missing required fields) are silently dropped without
   *   crashing the validator. Pins the defensive normalizeTemplate behavior — config can contain
   *   anything from older versions or hand-edited json.
   * Process: seed config with mixed valid + invalid entries; assert only the valid ones survive.
   */
  test('drops non-object and shape-invalid entries while keeping valid ones', async () => {
    await setRawTemplates([null, 'string', { name: 'no id, no prompt' }, validShape]);
    const templates = getTemplates();
    assert.strictEqual(templates.length, 1);
    assert.strictEqual(templates[0].id, 'tpl-1');
  });
});

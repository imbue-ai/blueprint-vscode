/**
 * Workflow tests for completing the onboarding wizard (the "Get started" click).
 *
 * Layer: integration (Extension Host + harness). Drives `App` end-to-end via the
 *   message bus and asserts on broadcast screens + persisted side effects.
 * Scope: completion with default settings (basic flow) and completion after the
 *   user customized sections/styles/depth/notes (round-trip into the saved template).
 * Out of scope: scalar setters in isolation (those are unit-tested in `state.unit.test.ts`)
 *   and the `setModel` integration (in `setModel.test.ts`).
 */
import * as assert from 'assert';
import * as vscode from 'vscode';

import type { TemplateConfig } from '../../src/types/onboarding';
import { resetExtensionState, setupHarness, waitFor } from '../helpers/harness';

interface SavedTemplate {
  name: string;
  filename: string;
  mode: 'structured' | 'freeform';
  config?: TemplateConfig;
  prompt: string;
}

async function arrangeFreshOnboarding(h: Awaited<ReturnType<typeof setupHarness>>) {
  await resetExtensionState(h.app);
  await h.app.resetOnboarding();
  await waitFor(() => h.screenOfType('onboarding'), 2000, 'onboarding screen');
}

suite('Workflow: onboarding completion', () => {
  /**
   * Goal: simulate a brand-new user finishing the onboarding wizard with default settings. After
   *   clicking "Get started", the extension must (a) set the onboarding-complete flag so the wizard
   *   doesn't reappear, (b) save a default plan template so the user can write plans immediately,
   *   and (c) move the UI from onboarding to the prompt screen.
   * Process: reset to a fresh state, drive App into OnboardingState, send `completeOnboarding`
   *   (same code path as the button click), wait for the prompt screen to appear, then assert all
   *   three side effects.
   */
  test('completing onboarding with defaults persists state and transitions to prompt screen', async () => {
    const h = await setupHarness();
    try {
      await arrangeFreshOnboarding(h);

      h.send({ type: 'completeOnboarding' });
      await waitFor(() => h.screenOfType('prompt'), 2000, 'prompt screen after onboarding');

      const flag = h.app.ctx.context.globalState.get<boolean>('blueprint.onboardingComplete');
      assert.strictEqual(flag, true, 'onboardingComplete flag should be set');

      const templates = vscode.workspace.getConfiguration('blueprint').get<unknown[]>('promptTemplates') ?? [];
      assert.ok(templates.length > 0, 'a default template should be persisted');
    } finally {
      h.dispose();
    }
  });

  /**
   * Goal: verify the round-trip from on-screen onboarding state to the saved default template.
   *   Whatever the user has configured on the screen at the moment they click "Get started" must
   *   be exactly what gets persisted in `blueprint.promptTemplates`, and the generated prompt body
   *   must reflect any user-supplied notes.
   * Process: arrange a fresh onboarding screen; apply a non-default mix of changes (add a preset
   *   section, switch styles to diagrams-only, switch depth to comprehensive, set notes); snapshot
   *   the on-screen `data` field; send `completeOnboarding`; wait for the prompt screen; read back
   *   `blueprint.promptTemplates` from global config; assert exactly one structured template was
   *   saved, its `config` is byte-equal to the on-screen snapshot, and its `prompt` body contains
   *   the user's notes string.
   */
  test('user customizations round-trip into the saved default template', async () => {
    const h = await setupHarness();
    try {
      await arrangeFreshOnboarding(h);

      h.send({ type: 'addTemplateSection', presetKey: 'testing' });
      h.send({ type: 'setTemplateStyles', styles: ['diagrams'] });
      h.send({ type: 'setTemplateDepth', depth: 'comprehensive' });
      h.send({ type: 'setTemplateNotes', notes: 'Always cite line numbers.' });

      await waitFor(
        () => (h.screenOfType('onboarding')?.data.notes === 'Always cite line numbers.' ? true : null),
        1000,
        'notes settled',
      );
      const expected = h.screenOfType('onboarding')!.data;

      h.send({ type: 'completeOnboarding' });
      await waitFor(() => h.screenOfType('prompt'), 2000, 'prompt screen after onboarding');

      const templates = vscode.workspace.getConfiguration('blueprint').get<SavedTemplate[]>('promptTemplates') ?? [];
      assert.strictEqual(templates.length, 1, 'one default template should be saved');
      const saved = templates[0];
      assert.strictEqual(saved.mode, 'structured', 'onboarding produces a structured template');
      assert.ok(saved.config, 'structured template should carry its config');

      assert.deepStrictEqual(saved.config!.sections, expected.sections, 'sections should round-trip');
      assert.deepStrictEqual(saved.config!.styles, expected.styles, 'styles should round-trip');
      assert.strictEqual(saved.config!.depth, expected.depth, 'depth should round-trip');
      assert.strictEqual(saved.config!.notes, expected.notes, 'notes should round-trip');

      assert.ok(saved.prompt.length > 0, 'generated prompt body should be non-empty');
      assert.ok(saved.prompt.includes(expected.notes), 'generated prompt should include the user notes');
    } finally {
      h.dispose();
    }
  });

  /**
   * Goal: pin the trust contract — the back-end deliberately has no validation; whatever reaches
   *   `OnboardingState.complete()` is saved verbatim. The front-end is the only validation layer
   *   (component tests cover that). This test bypasses the UI by sending `completeOnboarding`
   *   directly, then asserts edge inputs round-trip into the saved template. If a future change
   *   adds backend validation, this test fails and forces the change to be deliberate.
   * Process: empty all sections; add two blank custom sections; blank styles and notes; complete;
   *   assert the saved template's config equals the on-screen state and the prompt body is a string.
   */
  test('permissive — empty sections / styles / notes round-trip into the saved template', async () => {
    const h = await setupHarness();
    try {
      await arrangeFreshOnboarding(h);

      // Remove every default section.
      let current = h.screenOfType('onboarding')!.data.sections;
      while (current.length > 0) {
        h.send({ type: 'removeTemplateSection', sectionId: current[0].id });
        const expectedLength = current.length - 1;
        await waitFor(
          () => (h.screenOfType('onboarding')?.data.sections.length === expectedLength ? true : null),
          1000,
          `sections count = ${expectedLength}`,
        );
        current = h.screenOfType('onboarding')!.data.sections;
      }

      // Add two blank custom sections.
      h.send({ type: 'addTemplateSection', presetKey: null });
      h.send({ type: 'addTemplateSection', presetKey: null });
      await waitFor(
        () => (h.screenOfType('onboarding')?.data.sections.length === 2 ? true : null),
        1000,
        'two custom sections',
      );

      h.send({ type: 'setTemplateStyles', styles: [] });
      h.send({ type: 'setTemplateNotes', notes: '' });
      await waitFor(
        () => {
          const d = h.screenOfType('onboarding')?.data;
          return d && d.styles.length === 0 && d.notes === '' ? true : null;
        },
        1000,
        'styles emptied and notes blanked',
      );

      const expected = h.screenOfType('onboarding')!.data;
      assert.strictEqual(expected.sections.length, 2, 'precondition: two sections');
      assert.ok(
        expected.sections.every((s) => s.title === '' && s.description === ''),
        'precondition: all empty',
      );

      h.send({ type: 'completeOnboarding' });
      await waitFor(() => h.screenOfType('prompt'), 2000, 'prompt screen after onboarding');

      const templates = vscode.workspace.getConfiguration('blueprint').get<SavedTemplate[]>('promptTemplates') ?? [];
      assert.strictEqual(templates.length, 1, 'one default template saved');
      const saved = templates[0];

      assert.deepStrictEqual(saved.config!.sections, expected.sections, 'empty-title sections survive');
      assert.deepStrictEqual(saved.config!.styles, [], 'empty styles array survives');
      assert.strictEqual(saved.config!.notes, '', 'blank notes survive');

      assert.strictEqual(typeof saved.prompt, 'string', 'prompt body is generated (no crash)');
    } finally {
      h.dispose();
    }
  });

  /**
   * Goal: completing onboarding without making any changes still produces a usable saved template
   *   — the prompt body must be non-empty (Claude needs something to act on) and the config must
   *   carry the canonical defaults. Catches regressions where someone changes the defaults to
   *   produce an empty/broken prompt body.
   * Process: arrange a fresh onboarding screen; send `completeOnboarding` immediately without
   *   touching anything; wait for the prompt screen; assert the saved template has a non-empty
   *   prompt body and at least one section.
   */
  test('completing onboarding with no customizations produces a usable saved template', async () => {
    const h = await setupHarness();
    try {
      await arrangeFreshOnboarding(h);

      h.send({ type: 'completeOnboarding' });
      await waitFor(() => h.screenOfType('prompt'), 2000, 'prompt screen after onboarding');

      const templates = vscode.workspace.getConfiguration('blueprint').get<SavedTemplate[]>('promptTemplates') ?? [];
      assert.strictEqual(templates.length, 1, 'one default template saved');
      const saved = templates[0];
      assert.ok(saved.prompt.trim().length > 0, 'prompt body should be non-empty');
      assert.ok(saved.config && saved.config.sections.length > 0, 'default config should have sections');
    } finally {
      h.dispose();
    }
  });

  /**
   * Goal: pin the overwrite-not-merge contract for `generateDefaultTemplate`. When the user
   *   resets onboarding after the extension has been used (so `blueprint.promptTemplates` already
   *   contains custom templates), completing onboarding REPLACES the array — old templates are
   *   wiped and the new Default is the only entry left. A future change to merge instead of
   *   replace would silently keep stale templates around.
   * Process: pre-populate `blueprint.promptTemplates` with two fake templates via the global
   *   config; arrange a fresh onboarding screen (resetOnboarding clears templates, so re-populate
   *   AFTER the reset but BEFORE completion); complete onboarding; assert the saved array has
   *   exactly one template and its name is "Default".
   */
  test('completing onboarding replaces any pre-existing promptTemplates array', async () => {
    const h = await setupHarness();
    try {
      await arrangeFreshOnboarding(h);

      // Inject pre-existing templates AFTER reset so they'd survive into completion if
      // generateDefaultTemplate were appending instead of replacing.
      const preExisting: SavedTemplate[] = [
        { name: 'Stale 1', filename: 'plan.md', mode: 'freeform', prompt: 'old prompt 1' },
        { name: 'Stale 2', filename: 'plan.md', mode: 'freeform', prompt: 'old prompt 2' },
      ];
      await vscode.workspace
        .getConfiguration('blueprint')
        .update('promptTemplates', preExisting, vscode.ConfigurationTarget.Global);

      h.send({ type: 'completeOnboarding' });
      await waitFor(() => h.screenOfType('prompt'), 2000, 'prompt screen after onboarding');

      const templates = vscode.workspace.getConfiguration('blueprint').get<SavedTemplate[]>('promptTemplates') ?? [];
      assert.strictEqual(templates.length, 1, 'pre-existing templates should be replaced, not merged');
      assert.strictEqual(templates[0].name, 'Default', 'the surviving template should be the new Default');
    } finally {
      h.dispose();
    }
  });
});

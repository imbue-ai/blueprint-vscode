/**
 * Workflow tests for the writing phase — what happens after "Generate plan" is clicked, all
 * the way through to the spec file being written and the editor warmup starting.
 *
 * Layer: integration (Extension Host + harness + fake `ClaudeSession`).
 * Scope: drives the App from a refinement screen, sends `generateSpec`, and verifies the
 *   downstream effects: slug session is created, spec file path is `blueprint/<slug>/<filename>`,
 *   the file is written with content AFTER `SPEC_START_MARKER` only (preamble is stripped),
 *   and the screen transitions to spec-editing.
 * Out of scope: real Claude behavior; the editor warmup itself (covered in
 *   `tests/workflows/open-existing-plan.test.ts`); slug sanitization edge cases (covered in
 *   `tests/writing/featureManager.unit.test.ts`).
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

import { assistantText, resultDone, streamMessageStart, streamTextDelta, systemInit } from '../helpers/fakeSession';
import { resetExtensionState, setupHarness, waitFor } from '../helpers/harness';

const SPEC_START_MARKER = '<!-- spec-start -->';

async function arrangeAtPromptScreen(h: Awaited<ReturnType<typeof setupHarness>>) {
  await resetExtensionState(h.app);
  await h.app.resetOnboarding();
  await waitFor(() => h.screenOfType('onboarding'), 2000, 'onboarding screen');
  h.send({ type: 'completeOnboarding' });
  await waitFor(() => h.screenOfType('prompt'), 2000, 'prompt screen');
}

suite('Workflow: writing phase', () => {
  /**
   * Goal: a full prompt → question → generate-plan flow ends with a spec file written to disk
   *   at `blueprint/<slug>/<filename>` and the screen transitioned to spec-editing. Pins the
   *   end-to-end happy path through the writing state.
   * Process: complete onboarding; script round-1 questioning + slug + writing sessions;
   *   submit prompt; wait for refinement; click Generate plan; wait for the spec-editing screen;
   *   assert the file exists and contains the post-marker content.
   */
  test('generate plan writes spec file and transitions to spec-editing', async () => {
    const h = await setupHarness();
    try {
      await arrangeAtPromptScreen(h);
      const workingDir = h.app.ctx.workingDir;
      assert.ok(workingDir, 'integration test requires a workspace folder');

      const questionJson = JSON.stringify({ text: 'What database?' });
      const slug = 'test-feature';
      const specBody = '# Overview\n\nThis is the plan body.\n';

      h.fakes.script([
        systemInit('q'),
        streamTextDelta(`<question>\n${questionJson}\n</question>\n`, 'q'),
        resultDone('q'),
      ]);
      h.fakes.script([systemInit('slug'), assistantText(slug, 'slug'), resultDone('slug')]);
      h.fakes.script([
        systemInit('write'),
        streamMessageStart('write'),
        streamTextDelta(`Some preamble we should NOT save.\n${SPEC_START_MARKER}\n${specBody}`, 'write'),
        resultDone('write'),
      ]);

      h.send({ type: 'setPrompt', prompt: 'Build a profile API' });
      h.send({ type: 'submitSpecPrompt' });
      await waitFor(
        () => {
          const s = h.screenOfType('promptRefinement');
          return s && s.questions.length > 0 ? s : null;
        },
        3000,
        'refinement screen with question',
      );

      // Editor warmup will also call session.prompt; script an empty stream so it completes.
      h.fakes.script([systemInit('warmup'), resultDone('warmup')]);

      h.send({ type: 'generateSpec' });

      const specEditing = await waitFor(
        () => {
          const s = h.screenOfType('specEditing');
          return s && s.specFilePath ? s : null;
        },
        5000,
        'spec-editing screen with specFilePath set',
      );
      assert.ok(
        specEditing.specFilePath.startsWith('blueprint/'),
        `unexpected specFilePath: ${specEditing.specFilePath}`,
      );
      assert.ok(specEditing.specFilePath.endsWith('.md'));

      // Verify the file exists on disk and has the post-marker content (preamble stripped).
      const absPath = path.join(workingDir, specEditing.specFilePath);
      const written = fs.readFileSync(absPath, 'utf8');
      assert.ok(written.includes('# Overview'));
      assert.ok(!written.includes('Some preamble we should NOT save'), 'preamble should be stripped');
      assert.ok(!written.includes(SPEC_START_MARKER), 'marker itself should be stripped');

      // Cleanup the generated dir.
      const featureDir = path.join(workingDir, path.dirname(specEditing.specFilePath));
      fs.rmSync(featureDir, { recursive: true, force: true });
    } finally {
      h.dispose();
    }
  });

  /**
   * Goal: when the slug session returns a name that conflicts with an existing directory in
   *   `blueprint/`, the writing flow uses the deduplicated name (`-2`, `-3`, …) so existing
   *   plans aren't overwritten. Pins the end-to-end deduplication behavior.
   * Process: pre-create `blueprint/test-feature/` in the workspace; run the same flow as above;
   *   assert the resulting spec file path uses `test-feature-2`.
   */
  test('generate plan uses a deduplicated slug when the directory already exists', async () => {
    const h = await setupHarness();
    try {
      await arrangeAtPromptScreen(h);
      const workingDir = h.app.ctx.workingDir;
      assert.ok(workingDir);

      // Pre-create a conflicting directory.
      const blueprintDir = path.join(workingDir, 'blueprint');
      const conflicting = path.join(blueprintDir, 'test-feature');
      fs.mkdirSync(conflicting, { recursive: true });

      const questionJson = JSON.stringify({ text: 'What database?' });
      h.fakes.script([
        systemInit('q'),
        streamTextDelta(`<question>\n${questionJson}\n</question>\n`, 'q'),
        resultDone('q'),
      ]);
      h.fakes.script([systemInit('slug'), assistantText('test-feature', 'slug'), resultDone('slug')]);
      h.fakes.script([
        systemInit('write'),
        streamMessageStart('write'),
        streamTextDelta(`${SPEC_START_MARKER}\n# Plan\n`, 'write'),
        resultDone('write'),
      ]);
      h.fakes.script([systemInit('warmup'), resultDone('warmup')]);

      h.send({ type: 'setPrompt', prompt: 'Add another feature' });
      h.send({ type: 'submitSpecPrompt' });
      await waitFor(
        () => {
          const s = h.screenOfType('promptRefinement');
          return s && s.questions.length > 0 ? s : null;
        },
        3000,
        'refinement screen',
      );

      h.send({ type: 'generateSpec' });

      const specEditing = await waitFor(
        () => {
          const s = h.screenOfType('specEditing');
          return s && s.specFilePath ? s : null;
        },
        5000,
        'spec-editing screen with specFilePath set',
      );
      // The dedup loop appends -2, -3, etc. until a free slot is found. Across multiple test
      // runs the workspace may already contain `test-feature-2`, `test-feature-3`, etc. — so
      // we just assert the slug WAS deduplicated (has a numeric suffix).
      assert.match(
        specEditing.specFilePath,
        /^blueprint\/test-feature-\d+\//,
        `expected deduplicated path, got: ${specEditing.specFilePath}`,
      );

      // Cleanup
      fs.rmSync(blueprintDir, { recursive: true, force: true });
    } finally {
      h.dispose();
    }
  });
});

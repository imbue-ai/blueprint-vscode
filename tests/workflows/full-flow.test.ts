/**
 * End-to-end workflow test that walks the full spine of the app — onboarding → prompt →
 * questioning → generate plan → writing → editor warmup → editor ready.
 *
 * Layer: integration (Extension Host + harness + fake `ClaudeSession`). Each phase's session
 *   is scripted via `FakeSessionFactory.script`; the queue is consumed in prompt-call order.
 * Scope: pins that the state machine flows from PromptState all the way to EditorReadyState
 *   without any state being skipped or stuck. Pins the cross-state hand-offs of the warmedUp
 *   session and the spec-file path.
 * Out of scope: streaming details of any single phase (covered in their dedicated unit tests);
 *   real plan content interpretation; the file picker (the open-existing-plan workflow already
 *   covers the "land directly in StartingEditorAgent" path).
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

import { SPEC_START_MARKER } from '../../src/core/systemPrompts';
import { assistantText, resultDone, streamMessageStart, streamTextDelta, systemInit } from '../helpers/fakeSession';
import { resetExtensionState, setupHarness, waitFor } from '../helpers/harness';

suite('Workflow: full prompt → questions → write → edit flow', () => {
  /**
   * Goal: a single happy-path drive from the prompt screen to the editor-ready screen, with one
   *   round of questioning and a minimal plan body. Verifies that:
   *     - Prompt → PromptQuestions transition works (a question is parsed and rendered).
   *     - Generate plan transitions to WritingSpec which streams content into the spec file
   *       under blueprint/<slug>/plan.md.
   *     - WritingSpec → StartingEditorAgent transition carries the warmedUp session forward.
   *     - StartingEditorAgent runs one warmup prompt and transitions to EditorReady.
   *     - The final screen is specEditing with editorAgent.phase = 'ready' and the right
   *       specFilePath.
   * Process: complete onboarding; script (in order) the prompt-questions stream, the slug
   *   response, the writing stream (with SPEC_START_MARKER followed by plan body), the warmup
   *   response; submit the prompt; wait for questioning, send generateSpec; wait for editor ready.
   */
  test('drives PromptState → … → EditorReadyState end-to-end', async () => {
    const h = await setupHarness();
    try {
      await resetExtensionState(h.app);
      await h.app.resetOnboarding();
      await waitFor(() => h.screenOfType('onboarding'), 2000, 'onboarding screen');
      h.send({ type: 'completeOnboarding' });
      await waitFor(() => h.screenOfType('prompt'), 2000, 'prompt screen');

      // 1. Prompt-questions round 1: stream one inline <question>.
      const questionJson = JSON.stringify({ text: 'What database?', choices: ['Postgres', 'MySQL'] });
      h.fakes.script([
        systemInit('q-r1'),
        streamTextDelta(`<question>\n${questionJson}\n</question>\n`, 'q-r1'),
        resultDone('q-r1'),
      ]);

      // 2. Feature slug generation: returns a slug.
      h.fakes.script([systemInit('slug'), assistantText('full-flow-test', 'slug'), resultDone('slug')]);

      // 3. Writing the plan. The state listens for the spec-start marker in text deltas, and
      //    appends everything after it to the plan file. Send a single message_start (clears
      //    the file) followed by deltas containing the marker and a tiny body.
      h.fakes.script([
        systemInit('write'),
        streamMessageStart('write'),
        streamTextDelta(`Reasoning preamble.\n\n${SPEC_START_MARKER}\n# My plan\n\nA tiny body.\n`, 'write'),
        resultDone('write'),
      ]);

      // 4. Editor agent warmup: one assistant text response is enough to terminate the loop.
      h.fakes.script([
        systemInit('warmup'),
        assistantText('Reviewed the plan and codebase.', 'warmup'),
        resultDone('warmup'),
      ]);

      h.send({ type: 'setPrompt', prompt: 'Build a profile API' });
      h.send({ type: 'submitSpecPrompt' });

      // Wait for the questioning round to surface a question.
      const refinement = await waitFor(
        () => {
          const s = h.screenOfType('promptRefinement');
          return s && s.questions.length > 0 ? s : null;
        },
        3000,
        'round-1 question visible',
      );

      // Trigger the "generate plan" transition.
      h.send({ type: 'generateSpec' });

      // The screen should now be specEditing (writing in progress, then warming up, then ready).
      // Wait for the terminal state where editor.phase === 'ready'.
      const ready = await waitFor(
        () => {
          const s = h.screenOfType('specEditing');
          return s && s.editorAgent.phase === 'ready' ? s : null;
        },
        5000,
        'editor ready phase',
      );

      assert.strictEqual(ready.editorAgent.working, false);
      assert.strictEqual(ready.specFilePath, 'blueprint/full-flow-test/plan.md');
      assert.strictEqual(ready.prompt, refinement.currentPrompt);

      // The plan file was actually written under blueprint/<slug>/plan.md with the expected body.
      const absPath = path.join(h.app.ctx.workingDir, ready.specFilePath);
      const content = fs.readFileSync(absPath, 'utf-8');
      assert.ok(content.includes('# My plan'), 'plan file should contain the streamed body');
      assert.ok(!content.includes(SPEC_START_MARKER), 'spec-start marker should be stripped');

      // The factory's `created` array only tracks top-level sessions made via
      // `ctx.createSession(...)`; forks are created inside `FakeClaudeSession.fork()` and
      // aren't tracked. So we can assert on the create-via-factory sessions only.
      const promptQuestions = h.fakes.created.filter((s) => s.name === 'Prompt questions');
      const slugSessions = h.fakes.created.filter((s) => s.name === 'Feature slug');
      assert.strictEqual(promptQuestions.length, 1, 'one Prompt questions session created');
      assert.strictEqual(slugSessions.length, 1, 'one Feature slug session created');
      assert.ok(
        h.fakes.created.some((s) => s.name === 'Editor questions'),
        'expected one Editor questions session created at end of warmup',
      );

      // Cleanup: remove the spec dir so subsequent tests don't see a debris feature slug.
      const blueprintDir = path.join(h.app.ctx.workingDir, 'blueprint');
      try {
        fs.rmSync(blueprintDir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    } finally {
      h.dispose();
    }
  });
});

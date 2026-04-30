/**
 * Workflow test for the prompt → questioning flow.
 *
 * Layer: integration (Extension Host + harness + fake `ClaudeSession`).
 * Scope: from the prompt screen, send `submitSpecPrompt`; the questioning agent
 *   streams `<question>` XML in text deltas; verify a parsed question surfaces on
 *   the prompt-refinement screen and exactly one "Prompt questions" session was
 *   created and prompted once.
 * Out of scope: real Claude behavior, "Keep planning" / "Generate plan" branches
 *   (cover those in their own files when added).
 */
import * as assert from 'assert';

import { resultDone, streamTextDelta, systemInit } from '../helpers/fakeSession';
import { resetExtensionState, setupHarness, waitFor } from '../helpers/harness';

suite('Workflow: submit prompt', () => {
  /**
   * Goal: verify the prompt → questioning flow. When the user types a feature description and clicks
   *   "Submit" on the prompt screen, the questioning agent should run and any `<question>` XML tags
   *   it streams should be parsed into structured questions on the prompt-refinement screen.
   * Process: complete onboarding to land on the prompt screen; script the fake session to emit a
   *   text-delta stream containing one inline `<question>` JSON tag; send `setPrompt` then
   *   `submitSpecPrompt` (same code path as the button); wait for a `promptRefinement` screen with
   *   at least one parsed question; assert the prompt round-tripped and exactly one "Prompt
   *   questions" session was created and prompted once.
   */
  test('submitting a prompt streams a question and lands on prompt-refinement screen', async () => {
    const h = await setupHarness();
    try {
      // Arrange: complete onboarding so the App lands on PromptState.
      await resetExtensionState(h.app);
      await h.app.resetOnboarding();
      await waitFor(() => h.screenOfType('onboarding'), 2000, 'onboarding screen');
      h.send({ type: 'completeOnboarding' });
      await waitFor(() => h.screenOfType('prompt'), 2000, 'prompt screen');

      // Script the questioning session to emit one inline <question> tag.
      // The agent streams as text-deltas; parseQuestionXml picks the question out of the text stream.
      const sid = 'q-1';
      const questionJson = JSON.stringify({
        text: 'What database do you want?',
        choices: ['Postgres', 'MySQL'],
      });
      h.fakes.script([
        systemInit(sid),
        streamTextDelta(`Looking at the codebase…\n\n<question>\n${questionJson}\n</question>\n`, sid),
        resultDone(sid),
      ]);

      h.send({ type: 'setPrompt', prompt: 'Add a profile API' });
      h.send({ type: 'submitSpecPrompt' });

      // Wait for the refinement screen to appear AND for it to contain at least one question.
      const refinement = await waitFor(
        () => {
          const s = h.screenOfType('promptRefinement');
          return s && s.questions.length > 0 ? s : null;
        },
        3000,
        'promptRefinement screen with at least one question',
      );

      assert.ok(refinement.questions.length >= 1, 'expected at least one parsed question');
      assert.strictEqual(refinement.currentPrompt, 'Add a profile API');

      // The Prompt-questions session should have been created and prompted exactly once.
      const sessions = h.fakes.created.filter((s) => s.name === 'Prompt questions');
      assert.strictEqual(sessions.length, 1, 'expected one Prompt questions session');
      assert.strictEqual(sessions[0].prompts.length, 1, 'expected one questioning prompt');
    } finally {
      h.dispose();
    }
  });
});

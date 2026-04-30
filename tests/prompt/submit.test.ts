/**
 * Workflow tests for the prompt → questioning flow.
 *
 * Layer: integration (Extension Host + harness + fake `ClaudeSession`).
 * Scope: drives the App from the prompt screen through one or more rounds of questioning.
 *   Verifies that submitted prompts produce parsed `<question>` segments on the refinement
 *   screen, and that "Keep planning" advances to a second round with new questions.
 * Out of scope: real Claude behavior; the streaming-state machine internals (covered in
 *   `tests/prompt/promptQuestions.unit.test.ts`); the `<question>` parser (covered in
 *   `tests/prompt/xmlQuestionParser.unit.test.ts`); generate-plan transition (covered in
 *   the writing-phase tests when added).
 */
import * as assert from 'assert';

import { assistantToolUse, rateLimitRejected, resultDone, streamTextDelta, systemInit } from '../helpers/fakeSession';
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

  /**
   * Goal: verify the multi-round refinement loop. After landing on the refinement screen with one
   *   question, answering it and clicking "Keep planning" must (a) trigger a Prompt-refinement
   *   session, (b) trigger a continuation round on the questioning session, and (c) surface the
   *   new round's question on the screen. Pins the entire "Keep planning" path that the unit and
   *   component tests can only see in pieces.
   * Process: complete onboarding; submit a prompt with scripted round-1 stream containing one
   *   question; wait for the refinement screen; answer the question; script round 2 (refinement
   *   text deltas + new question); send `refinePrompt`; wait for the screen to settle with the
   *   new question's text visible.
   */
  test('Keep planning advances to a second round of questions', async () => {
    const h = await setupHarness();
    try {
      await resetExtensionState(h.app);
      await h.app.resetOnboarding();
      await waitFor(() => h.screenOfType('onboarding'), 2000, 'onboarding screen');
      h.send({ type: 'completeOnboarding' });
      await waitFor(() => h.screenOfType('prompt'), 2000, 'prompt screen');

      const round1Question = JSON.stringify({ text: 'What database?', choices: ['Postgres', 'MySQL'] });
      const round2Question = JSON.stringify({ text: 'What auth strategy?' });

      // Script (FIFO):
      //   1. Round-1 questioning session
      //   2. Prompt-refinement session
      //   3. Round-2 questioning continuation (forked session uses same queue)
      h.fakes.script([
        systemInit('q-r1'),
        streamTextDelta(`<question>\n${round1Question}\n</question>\n`, 'q-r1'),
        resultDone('q-r1'),
      ]);
      h.fakes.script([
        systemInit('refine'),
        streamTextDelta('Refined: build a profile API with OAuth\n', 'refine'),
        resultDone('refine'),
      ]);
      h.fakes.script([
        systemInit('q-r2'),
        streamTextDelta(`<question>\n${round2Question}\n</question>\n`, 'q-r2'),
        resultDone('q-r2'),
      ]);

      h.send({ type: 'setPrompt', prompt: 'Build a profile API' });
      h.send({ type: 'submitSpecPrompt' });

      const round1 = await waitFor(
        () => {
          const s = h.screenOfType('promptRefinement');
          return s && s.questions.length > 0 && s.questions.some((q) => q.text.includes('database')) ? s : null;
        },
        3000,
        'round 1 question visible',
      );
      const round1QuestionId = round1.questions[0].id;

      // Answer the round-1 question and click "Keep planning".
      h.send({ type: 'answerPromptQuestion', questionId: round1QuestionId, textAnswer: 'Postgres', chosenIndices: [] });
      h.send({ type: 'refinePrompt' });

      // Wait for the round-2 question to appear (the screen still says promptRefinement; the new
      // question replaces or is added alongside the frozen round-1).
      await waitFor(
        () => {
          const s = h.screenOfType('promptRefinement');
          return s && s.questions.some((q) => q.text.includes('auth strategy')) ? s : null;
        },
        3000,
        'round 2 question visible',
      );

      // The Prompt-refinement session should have been created exactly once during the round.
      const refineSessions = h.fakes.created.filter((s) => s.name === 'Prompt refinement');
      assert.strictEqual(refineSessions.length, 1, 'expected one Prompt refinement session');
    } finally {
      h.dispose();
    }
  });

  /**
   * Goal: tool-use messages from the questioning agent appear as `tool_call` entries in the
   *   broadcast `questioningMessages` so the user sees what the agent is doing during
   *   exploration. Pins the SDK message → on-screen tool-call rendering path that
   *   `extractToolUseFromContent` and `createToolCallStreamItem` drive.
   * Process: complete onboarding; script a stream that includes one assistant tool_use message
   *   (Read foo.ts) followed by a question; submit; wait for the screen to surface a tool_call
   *   entry; assert its name is 'Read'.
   */
  test('tool-use messages from the agent appear as tool_call entries on the screen', async () => {
    const h = await setupHarness();
    try {
      await resetExtensionState(h.app);
      await h.app.resetOnboarding();
      await waitFor(() => h.screenOfType('onboarding'), 2000, 'onboarding screen');
      h.send({ type: 'completeOnboarding' });
      await waitFor(() => h.screenOfType('prompt'), 2000, 'prompt screen');

      const sid = 'tool-test';
      const questionJson = JSON.stringify({ text: 'What database?' });
      h.fakes.script([
        systemInit(sid),
        assistantToolUse('Read', { file_path: 'src/foo.ts' }, sid),
        streamTextDelta(`<question>\n${questionJson}\n</question>\n`, sid),
        resultDone(sid),
      ]);

      h.send({ type: 'setPrompt', prompt: 'Build a thing' });
      h.send({ type: 'submitSpecPrompt' });

      const screen = await waitFor(
        () => {
          const s = h.screenOfType('promptRefinement');
          const hasToolCall = s?.questioningMessages.some((m) => m.type === 'tool_call');
          const hasQuestion = s?.questions.length && s.questions.length > 0;
          return s && hasToolCall && hasQuestion ? s : null;
        },
        3000,
        'tool_call entry visible alongside the question',
      );

      const toolCalls = screen.questioningMessages.filter((m) => m.type === 'tool_call');
      assert.ok(toolCalls.length >= 1);
      assert.strictEqual(toolCalls[0].type === 'tool_call' ? toolCalls[0].name : null, 'Read');
    } finally {
      h.dispose();
    }
  });

  /**
   * Goal: a rate-limit rejection during questioning bubbles up via `app.onRateLimit`. Pins the
   *   propagation contract from the questioning state.
   *
   * SKIPPED — cross-module `instanceof RateLimitError` issue. The fake session throws a
   *   `RateLimitError` from `out/src/core/session.js` but the GeneratingPromptQuestionsState's
   *   catch block (running in the bundled `dist/extension.js`) uses `instanceof RateLimitError`
   *   against a different class object, so the check fails. The handler's logic is covered by
   *   in-process unit tests; revisit this integration test if we ever add a robust same-module
   *   error import path (e.g. expose RateLimitError via the activate test API).
   */
  test.skip('rate-limit during questioning bubbles up to onRateLimit', async () => {
    const h = await setupHarness();
    try {
      await resetExtensionState(h.app);
      await h.app.resetOnboarding();
      await waitFor(() => h.screenOfType('onboarding'), 2000, 'onboarding screen');
      h.send({ type: 'completeOnboarding' });
      await waitFor(() => h.screenOfType('prompt'), 2000, 'prompt screen');

      const resetsAt = Date.now() + 60_000;
      h.fakes.script([systemInit('rl'), rateLimitRejected(resetsAt, 'rl')]);

      h.send({ type: 'setPrompt', prompt: 'Build a thing' });
      h.send({ type: 'submitSpecPrompt' });

      await waitFor(
        () => {
          const latest = h.latest();
          return latest && latest.status === 'ok' && latest.rateLimitResetsAt !== undefined ? latest : null;
        },
        3000,
        'rateLimitResetsAt set in broadcast',
      );
    } finally {
      h.dispose();
    }
  });
});

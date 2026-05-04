/**
 * Workflow tests for the tributary user journeys that branch off the main spine: reset
 * onboarding, multi-round questioning, panel-submit-to-edit, feedback-submit-to-edit.
 *
 * Layer: integration (Extension Host + harness + fake `ClaudeSession`).
 * Scope: each test drives one tributary end-to-end via the public App API. The spine
 *   (`Onboarding → Prompt → Questions → Writing → Editor`) is covered by full-flow.test.ts;
 *   this file covers the side branches that share state-machine surface area.
 * Out of scope: per-state handler logic (covered by individual unit tests); the spine flow.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

import { StartingEditorAgentState } from '../../src/core/states/startingEditorAgent';
import { assistantText, resultDone, streamTextDelta, systemInit } from '../helpers/fakeSession';
import { resetExtensionState, setupHarness, waitFor } from '../helpers/harness';

async function arrangeAtEditorReady(h: Awaited<ReturnType<typeof setupHarness>>, planContent: string) {
  await resetExtensionState(h.app);
  await h.app.ctx.context.globalState.update('blueprint.onboardingComplete', true);
  const workingDir = h.app.ctx.workingDir;
  const specRel = 'blueprint/tributary-test/plan.md';
  const specAbs = path.join(workingDir, specRel);
  fs.mkdirSync(path.dirname(specAbs), { recursive: true });
  fs.writeFileSync(specAbs, planContent);

  h.fakes.script([systemInit('warmup'), assistantText('Reviewed.', 'warmup'), resultDone('warmup')]);
  h.app.setState(new StartingEditorAgentState(h.app.ctx, specRel, planContent, ''));
  await waitFor(
    () => {
      const s = h.screenOfType('specEditing');
      return s && s.editorAgent.phase === 'ready' ? s : null;
    },
    3000,
    'editor ready',
  );
  return { specRel, specAbs };
}

function cleanupBlueprintDir(workingDir: string): void {
  try {
    fs.rmSync(path.join(workingDir, 'blueprint'), { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

suite('Workflow: reset onboarding from anywhere', () => {
  /**
   * Goal: `app.resetOnboarding()` (the VS Code command target) snaps the App back to
   *   OnboardingState regardless of where it currently is. Pins the recovery handle the user
   *   gets via the `blueprint.resetOnboarding` command — important because once the user has
   *   committed to an active editing session, this is the only escape hatch back to a clean
   *   slate.
   * Process: arrange the App at editor-ready with an active session; call resetOnboarding;
   *   assert the next broadcast is the onboarding screen and `onboardingComplete` flag is
   *   cleared.
   */
  test('resetOnboarding from EditorReady transitions to OnboardingState', async () => {
    const h = await setupHarness();
    try {
      const { specAbs } = await arrangeAtEditorReady(h, '# Plan');
      assert.strictEqual(h.app.isSessionActive(), true);

      await h.app.resetOnboarding();
      await waitFor(() => h.screenOfType('onboarding'), 2000, 'onboarding screen');

      const flag = h.app.ctx.context.globalState.get<boolean>('blueprint.onboardingComplete');
      assert.notStrictEqual(flag, true, 'onboardingComplete should be cleared');
      assert.strictEqual(h.app.isSessionActive(), false);

      // The plan file itself is left on disk (resetOnboarding only clears extension state, not
      // user files); clean it up for the next test.
      try {
        fs.unlinkSync(specAbs);
      } catch {
        // best-effort
      }
      cleanupBlueprintDir(h.app.ctx.workingDir);
    } finally {
      h.dispose();
    }
  });
});

suite('Workflow: multi-round questioning', () => {
  /**
   * Goal: the questioning agent supports multiple continuation rounds. Round 1 → answer → "Keep
   *   planning" → round 2 → answer → "Keep planning" → round 3. Pins that `roundCount`
   *   increments correctly across continuations and that frozen rounds accumulate while the new
   *   active round renders fresh questions.
   * Process: complete onboarding; submit a prompt; script three rounds of questioning + two
   *   refinement-prompt sessions; drive through them; assert `isFirstRound` flips to false on
   *   round 2 and stays false on round 3.
   */
  test('three rounds of questioning, isFirstRound only true on round 1', async () => {
    const h = await setupHarness();
    try {
      await resetExtensionState(h.app);
      await h.app.resetOnboarding();
      await waitFor(() => h.screenOfType('onboarding'), 2000, 'onboarding screen');
      h.send({ type: 'completeOnboarding' });
      await waitFor(() => h.screenOfType('prompt'), 2000, 'prompt screen');

      const q1 = JSON.stringify({ text: 'Round 1 question?' });
      const q2 = JSON.stringify({ text: 'Round 2 question?' });
      const q3 = JSON.stringify({ text: 'Round 3 question?' });

      h.fakes.script([systemInit('q1'), streamTextDelta(`<question>\n${q1}\n</question>\n`, 'q1'), resultDone('q1')]);
      h.fakes.script([systemInit('r1'), streamTextDelta('Refined 1\n', 'r1'), resultDone('r1')]);
      h.fakes.script([systemInit('q2'), streamTextDelta(`<question>\n${q2}\n</question>\n`, 'q2'), resultDone('q2')]);
      h.fakes.script([systemInit('r2'), streamTextDelta('Refined 2\n', 'r2'), resultDone('r2')]);
      h.fakes.script([systemInit('q3'), streamTextDelta(`<question>\n${q3}\n</question>\n`, 'q3'), resultDone('q3')]);

      h.send({ type: 'setPrompt', prompt: 'Build a thing' });
      h.send({ type: 'submitSpecPrompt' });

      const round1 = await waitFor(
        () => {
          const s = h.screenOfType('promptRefinement');
          return s && s.questions.some((q) => q.text.includes('Round 1')) ? s : null;
        },
        3000,
        'round 1 question',
      );
      assert.strictEqual(round1.isFirstRound, true, 'round 1 should report isFirstRound=true');

      h.send({
        type: 'answerPromptQuestion',
        questionId: round1.questions[0].id,
        textAnswer: 'A1',
        chosenIndices: [],
      });
      h.send({ type: 'refinePrompt' });

      const round2 = await waitFor(
        () => {
          const s = h.screenOfType('promptRefinement');
          return s && s.questions.some((q) => q.text.includes('Round 2')) ? s : null;
        },
        3000,
        'round 2 question',
      );
      assert.strictEqual(round2.isFirstRound, false, 'round 2 should report isFirstRound=false');

      h.send({
        type: 'answerPromptQuestion',
        questionId: round2.questions.find((q) => q.text.includes('Round 2'))!.id,
        textAnswer: 'A2',
        chosenIndices: [],
      });
      h.send({ type: 'refinePrompt' });

      const round3 = await waitFor(
        () => {
          const s = h.screenOfType('promptRefinement');
          return s && s.questions.some((q) => q.text.includes('Round 3')) ? s : null;
        },
        3000,
        'round 3 question',
      );
      assert.strictEqual(round3.isFirstRound, false, 'round 3 should still report isFirstRound=false');
    } finally {
      h.dispose();
    }
  });
});

suite('Workflow: panel-submit-to-edit', () => {
  /**
   * Goal: answering a panel question and submitting transitions from EditorReady → EditingState
   *   → back to EditorReady (after the agent's response). Pins the panel-driven editing path
   *   that mirrors the chat-driven path. Without this end-to-end check, the unit-level handler
   *   tests can't verify the transition actually round-trips.
   * Process: arrange editor-ready; manually inject a panel question (via specFileChanged isn't
   *   enough — use updateCurrentSnapshot through normal channels); answer it; submit; script
   *   the editing response; wait for editor.phase to return to ready; assert one Editing state
   *   was entered (we can detect this via broadcast count or by checking that the panel's
   *   round became frozen).
   */
  test('answering a panel question and submitting drives Editing → EditorReady', async () => {
    const h = await setupHarness();
    try {
      const { specAbs } = await arrangeAtEditorReady(h, '# Plan\n\n## Section\n');

      // Inject a question into the active panel round by reaching into the snapshot manager.
      // The panel-question handler tests cover this seam at the unit level; here we just need
      // a question on screen so the user can answer + submit.
      const internalApp = h.app as unknown as {
        state: {
          snapshotManager: { updateCurrentSnapshot: (u: unknown) => void };
        };
      };
      internalApp.state.snapshotManager.updateCurrentSnapshot({
        questionRounds: [
          {
            questions: [{ text: 'How big should sections be?', anchor: 'Section', textAnswer: '', chosenIndices: [] }],
            frozen: false,
          },
        ],
      });
      h.app.broadcast();

      const before = await waitFor(
        () => {
          const s = h.screenOfType('specEditing');
          return s && s.questionsPanel?.rounds.some((r) => r.questions.length > 0) ? s : null;
        },
        2000,
        'panel question visible',
      );
      assert.strictEqual(before.editorAgent.phase, 'ready');

      // Script the editing response (one assistant text reply, no Edit tool calls).
      h.fakes.script([systemInit('panel'), assistantText('Section size: small.', 'panel'), resultDone('panel')]);

      h.send({
        type: 'answerPanelQuestion',
        anchor: 'Section',
        textAnswer: 'Small',
        chosenIndices: [],
      });
      h.send({ type: 'submitPanelAnswers' });

      // After submit, the round should be frozen and the editor agent should run then return
      // to ready.
      const ready = await waitFor(
        () => {
          const s = h.screenOfType('specEditing');
          return s && s.editorAgent.phase === 'ready' && s.questionsPanel?.rounds.every((r) => r.frozen) ? s : null;
        },
        5000,
        'editor returned to ready and round frozen',
      );
      assert.strictEqual(ready.editorAgent.phase, 'ready');

      try {
        fs.unlinkSync(specAbs);
      } catch {
        // best-effort
      }
      cleanupBlueprintDir(h.app.ctx.workingDir);
    } finally {
      h.dispose();
    }
  });
});

suite('Workflow: feedback-submit-to-edit', () => {
  /**
   * Goal: adding a feedback item and clicking Submit transitions through EditingState and back
   *   to EditorReady. Pins the feedback submission path mirrors the chat path. Pending feedback
   *   should be moved to submitted (consumeFeedback=true wiring).
   * Process: arrange editor-ready; send addFeedback with one item; send submitSpecFeedback;
   *   script the editing response; wait for editor.phase=ready; assert pendingFeedback is empty
   *   (consumed) on the final snapshot.
   */
  test('submit feedback drives Editing and clears pending feedback', async () => {
    const h = await setupHarness();
    try {
      const { specAbs } = await arrangeAtEditorReady(h, '# Plan\n');

      h.fakes.script([systemInit('fb'), assistantText('Updated.', 'fb'), resultDone('fb')]);

      h.send({
        type: 'addFeedback',
        id: 'fb-1',
        text: 'tighten the intro',
        startLine: 1,
        endLine: 1,
      });
      await waitFor(
        () => {
          const s = h.screenOfType('specEditing');
          return s && s.nFeedback === 1 ? s : null;
        },
        2000,
        'feedback added',
      );

      h.send({ type: 'submitSpecFeedback' });

      const ready = await waitFor(
        () => {
          const s = h.screenOfType('specEditing');
          return s && s.editorAgent.phase === 'ready' ? s : null;
        },
        5000,
        'editor ready after feedback round-trip',
      );
      assert.strictEqual(ready.editorAgent.phase, 'ready');
      assert.strictEqual(ready.nFeedback, 0, 'pending feedback should be consumed by the submit');

      try {
        fs.unlinkSync(specAbs);
      } catch {
        // best-effort
      }
      cleanupBlueprintDir(h.app.ctx.workingDir);
    } finally {
      h.dispose();
    }
  });
});

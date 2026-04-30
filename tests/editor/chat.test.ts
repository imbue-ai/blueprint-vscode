/**
 * Workflow tests for the chat tab — sending a message during plan editing and seeing the
 * agent's reply in the activity stream.
 *
 * Layer: integration (Extension Host + harness + fake `ClaudeSession`).
 * Scope: drives the App from a freshly-warmed editor (after open-existing-plan) through one
 *   chat round — sets a draft, sends the message, scripts the editor agent's response,
 *   verifies the user message and the streamed reply appear as `StreamItem` entries on the
 *   spec-editing screen, and that the App returns to `EditorReadyState` (editor agent phase
 *   becomes `'ready'` again).
 * Out of scope: feedback flow, plan-questions panel, real Claude behavior, snapshot
 *   navigation between rounds.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

import { StartingEditorAgentState } from '../../src/core/states/startingEditorAgent';
import { assistantText, resultDone, streamMessageStart, streamTextDelta, systemInit } from '../helpers/fakeSession';
import { resetExtensionState, setupHarness, waitFor } from '../helpers/harness';

async function arrangeAtEditorReady(h: Awaited<ReturnType<typeof setupHarness>>, planContent: string) {
  await resetExtensionState(h.app);
  await h.app.ctx.context.globalState.update('blueprint.onboardingComplete', true);

  // Write a plan file inside the workspace so SpecFileSystemProvider can read it.
  const workingDir = h.app.ctx.workingDir;
  assert.ok(workingDir, 'integration test requires a workspace folder');
  const specRel = 'blueprint/chat-test/plan.md';
  const specAbs = path.join(workingDir, specRel);
  fs.mkdirSync(path.dirname(specAbs), { recursive: true });
  fs.writeFileSync(specAbs, planContent);

  // Editor warmup: simple successful response so the state transitions to ready.
  h.fakes.script([systemInit('warmup'), assistantText('Reviewed the plan.', 'warmup'), resultDone('warmup')]);
  h.app.setState(new StartingEditorAgentState(h.app.ctx, specRel, planContent, ''));

  // Wait for editor to reach ready state.
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

suite('Workflow: chat tab', () => {
  /**
   * Goal: sending a chat message during plan editing produces a `user_message` StreamItem
   *   immediately, then the agent's reply streams in as text, and the App returns to ready.
   *   Pins the round-trip from chat input to displayed reply.
   * Process: arrange editor at ready state with a small plan; set a draft; send `sendMessage`;
   *   script the editor agent to emit a text-delta reply; wait for the screen's streamItems
   *   to contain both the user message and an assistant reply; assert the editor agent
   *   returns to `'ready'`.
   */
  test('sending a chat message produces user + assistant stream items and returns to ready', async () => {
    const h = await setupHarness();
    try {
      const { specAbs } = await arrangeAtEditorReady(h, '# Plan\n\nSome content.\n');

      // Script the editor agent's reply for the chat round.
      h.fakes.script([
        systemInit('chat'),
        streamMessageStart('chat'),
        streamTextDelta('Sure, I can refine that section.', 'chat'),
        resultDone('chat'),
      ]);

      h.send({ type: 'setDraftMessage', message: 'Refine the API section' });
      h.send({ type: 'sendMessage' });

      // Wait for the user message to appear (immediate) and the reply to land.
      const ready = await waitFor(
        () => {
          const s = h.screenOfType('specEditing');
          if (!s || s.editorAgent.phase !== 'ready') return null;
          const userMsg = s.streamItems.find((i) => i.type === 'user_message');
          const assistantMsg = s.streamItems.find((i) => i.type === 'assistant_message');
          return userMsg && assistantMsg ? s : null;
        },
        5000,
        'chat round complete',
      );

      // The user message text round-tripped.
      const userItem = ready.streamItems.find((i) => i.type === 'user_message');
      assert.strictEqual(userItem?.type === 'user_message' ? userItem.content : null, 'Refine the API section');

      // The assistant's reply text appears in the stream.
      const assistantItem = ready.streamItems.find((i) => i.type === 'assistant_message');
      assert.ok(assistantItem?.type === 'assistant_message' && assistantItem.content.includes('refine that section'));

      // Cleanup
      fs.rmSync(path.dirname(specAbs), { recursive: true, force: true });
    } finally {
      h.dispose();
    }
  });

  /**
   * Goal: an empty draft can't be sent — clicking Send (or sending the message programmatically)
   *   while the draft is empty doesn't trigger an agent call. Pins the same gate the unit tests
   *   verify, but at the integration level (so wiring between the click and the handler is also
   *   exercised).
   * Process: arrange editor at ready; without setting a draft, send `sendMessage`; assert no
   *   editor session was created beyond the warmup.
   */
  test('sending with an empty draft does not trigger an agent call', async () => {
    const h = await setupHarness();
    try {
      const { specAbs } = await arrangeAtEditorReady(h, '# Plan\n');

      const beforeSessions = h.fakes.created.length;
      h.send({ type: 'sendMessage' });

      // Give it a moment in case there was an unintended async side effect.
      await new Promise((r) => setTimeout(r, 200));

      assert.strictEqual(h.fakes.created.length, beforeSessions, 'no new session should be created');

      fs.rmSync(path.dirname(specAbs), { recursive: true, force: true });
    } finally {
      h.dispose();
    }
  });
});

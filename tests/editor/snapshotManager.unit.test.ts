/**
 * Unit tests for `SnapshotManager` — the in-memory plan-edit history that drives the editing
 * session.
 *
 * Layer: unit (Mocha). Pure data structure tests; uses a stub `ClaudeSession` for the fork
 *   chain that `clone()` invokes per snapshot.
 * Scope: snapshot creation (append + replaceCurrent semantics), in-place updates, deep-clone
 *   isolation between cloned manager and source, session-forking on clone.
 * Out of scope: how SnapshotManager is consumed by EditorReadyState/EditingState (covered in
 *   the editor unit/integration tests); navigation between snapshots (no UI for it yet).
 */
import * as assert from 'assert';

import type { ClaudeSession } from '../../src/core/session';
import { SnapshotManager } from '../../src/core/snapshotManager';
import type { FeedbackItem } from '../../src/types/screens';

let _forkSeq = 0;
function stubSession(name = 'base'): ClaudeSession {
  const id = `session-${++_forkSeq}`;
  const stub = {
    name,
    id,
    fork: (forkName: string) => stubSession(forkName),
    abort: () => {},
    getSessionId: () => id,
    prompt: async function* () {},
  };
  return stub as ClaudeSession;
}

function emptySnapshotData(session: ClaudeSession) {
  return {
    prompt: 'p',
    specContent: '',
    chatMessages: [],
    streamItems: [],
    editingSession: session,
    submittedFeedback: [],
    pendingFeedback: [],
    questionRounds: [],
  };
}

suite('Unit: SnapshotManager', () => {
  /**
   * Goal: a fresh manager has no current snapshot. Pins the empty-state contract so callers
   *   can guard against null.
   * Process: instantiate; assert `getCurrentSnapshot()` returns null.
   */
  test('starts with no current snapshot', () => {
    const mgr = new SnapshotManager();
    assert.strictEqual(mgr.getCurrentSnapshot(), null);
  });

  /**
   * Goal: `createSnapshot` appends a new snapshot and makes it current. Pins the basic
   *   accumulation contract.
   * Process: create two snapshots; assert the second one is current; assert each carries the
   *   data passed in.
   */
  test('createSnapshot appends and becomes the current snapshot', () => {
    const mgr = new SnapshotManager();
    mgr.createSnapshot({ ...emptySnapshotData(stubSession()), prompt: 'first' });
    mgr.createSnapshot({ ...emptySnapshotData(stubSession()), prompt: 'second' });
    assert.strictEqual(mgr.getCurrentSnapshot()?.prompt, 'second');
  });

  /**
   * Goal: `updateCurrentSnapshot` patches the current snapshot in place. Pins the partial-
   *   update path used heavily by chat / feedback / question handlers to mutate a single
   *   field without rebuilding the whole snapshot.
   * Process: create a snapshot; call update with a new specContent and pendingFeedback; assert
   *   both fields are now on the snapshot and untouched fields survive.
   */
  test('updateCurrentSnapshot patches fields in place', () => {
    const mgr = new SnapshotManager();
    mgr.createSnapshot({ ...emptySnapshotData(stubSession()), prompt: 'orig' });
    const fb: FeedbackItem = { id: 'a', text: 'fb', startLine: 1, endLine: 1 };
    mgr.updateCurrentSnapshot({ specContent: '# Updated\n', pendingFeedback: [fb] });
    const snap = mgr.getCurrentSnapshot()!;
    assert.strictEqual(snap.specContent, '# Updated\n');
    assert.deepStrictEqual(snap.pendingFeedback, [fb]);
    assert.strictEqual(snap.prompt, 'orig', 'untouched fields should survive');
  });

  /**
   * Goal: `updateCurrentSnapshot` with no current snapshot is a silent no-op (no throw). Pins
   *   the defensive guard so the App doesn't crash if a stale handler arrives before the first
   *   snapshot is created.
   * Process: instantiate fresh; call update; assert no throw and getCurrentSnapshot still null.
   */
  test('updateCurrentSnapshot on an empty manager is a no-op', () => {
    const mgr = new SnapshotManager();
    mgr.updateCurrentSnapshot({ specContent: 'X' });
    assert.strictEqual(mgr.getCurrentSnapshot(), null);
  });

  /**
   * Goal: `clone()` deep-copies all snapshots so mutations on the cloned manager don't leak
   *   back into the original. Pins the isolation contract — without it, the going-forward state
   *   could corrupt the previous (preserved) snapshot.
   * Process: create a snapshot; clone; mutate the clone's pendingFeedback; assert the source's
   *   pendingFeedback is unchanged.
   */
  test('clone produces snapshots that mutate independently of the source', () => {
    const mgr = new SnapshotManager();
    const fb: FeedbackItem = { id: 'a', text: 'orig', startLine: 1, endLine: 1 };
    mgr.createSnapshot({ ...emptySnapshotData(stubSession()), pendingFeedback: [fb] });

    const cloned = mgr.clone();
    cloned.updateCurrentSnapshot({ pendingFeedback: [{ ...fb, text: 'mutated' }] });

    assert.strictEqual(mgr.getCurrentSnapshot()?.pendingFeedback[0].text, 'orig');
    assert.strictEqual(cloned.getCurrentSnapshot()?.pendingFeedback[0].text, 'mutated');
  });

  /**
   * Goal: nested arrays (questionRounds, chosenIndices on each question) are also deep-copied
   *   so per-round mutations on the clone don't leak. Pins the recursion in `cloneSnapshot`.
   * Process: create a snapshot with a question whose `chosenIndices` is non-empty; clone;
   *   push to the clone's chosenIndices; assert the source's chosenIndices unchanged.
   */
  test('clone deep-copies nested arrays inside questionRounds', () => {
    const mgr = new SnapshotManager();
    mgr.createSnapshot({
      ...emptySnapshotData(stubSession()),
      questionRounds: [
        {
          questions: [
            {
              text: 'Q',
              anchor: 'a',
              textAnswer: '',
              chosenIndices: [0],
            },
          ],
          frozen: false,
        },
      ],
    });
    const cloned = mgr.clone();
    cloned.getCurrentSnapshot()!.questionRounds[0].questions[0].chosenIndices.push(1);
    assert.deepStrictEqual(mgr.getCurrentSnapshot()!.questionRounds[0].questions[0].chosenIndices, [0]);
  });

  /**
   * Goal: `clone()` forks each snapshot's editingSession (so cloned snapshots have their own
   *   session lineage). Pins that downstream uses of the cloned manager don't share session
   *   state with the original.
   * Process: create a snapshot with a recognizable stub session; clone; assert the cloned
   *   snapshot's session has a different id than the source (the fork stub returns a new id).
   */
  test('clone forks each snapshot session so cloned and source sessions diverge', () => {
    const mgr = new SnapshotManager();
    mgr.createSnapshot(emptySnapshotData(stubSession('original')));
    const original = mgr.getCurrentSnapshot()!.editingSession;
    const cloned = mgr.clone();
    const clonedSession = cloned.getCurrentSnapshot()!.editingSession;
    assert.notStrictEqual(clonedSession, original, 'cloned session should be a different object');
  });
});

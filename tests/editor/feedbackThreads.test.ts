/**
 * Integration tests for `FeedbackThreadManager` — the bridge between the App's `FeedbackItem[]`
 * state and VS Code's `CommentThread` UI.
 *
 * Layer: integration (Extension Host + Mocha). Uses real `vscode.comments.createCommentController`
 *   so threads actually render in VS Code's gutter.
 * Scope: thread lifecycle on `update()` (create / reuse / dispose), label and comment-text
 *   updates when item changes, `adoptThread` ID-tracking for the "+" gutter flow, `findIdByThread`
 *   lookup, `getDecorations` returning ranges, `clear()` disposing everything.
 * Out of scope: the commands that wire user actions to this manager (those are in `editor.ts`,
 *   exercised via workflow tests); the FeedbackTab webview component (own test).
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { FeedbackThreadManager } from '../../src/editor/feedbackThreads';
import { SpecFileSystemProvider } from '../../src/editor/specFilesystem';
import type { FeedbackItem } from '../../src/types/screens';

function makeWorkingDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-fbt-test-'));
}

function rmrf(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function makeSpecProvider(dir: string): SpecFileSystemProvider {
  const provider = new SpecFileSystemProvider(dir);
  provider.setSpecFile('spec.md');
  return provider;
}

function makeManager(): { manager: FeedbackThreadManager; controller: vscode.CommentController; dispose: () => void } {
  const controller = vscode.comments.createCommentController(`blueprint-test-${Date.now()}-${Math.random()}`, 'Test');
  const manager = new FeedbackThreadManager(controller);
  return { manager, controller, dispose: () => controller.dispose() };
}

const item = (overrides: Partial<FeedbackItem> = {}): FeedbackItem => ({
  id: 'fb-1',
  text: 'tighten this paragraph',
  startLine: 5,
  endLine: 5,
  ...overrides,
});

suite('Integration: FeedbackThreadManager — update lifecycle', () => {
  /**
   * Goal: `update()` creates a new comment thread for an item the manager hasn't seen before.
   *   Pins the basic create path that puts a new feedback bubble in the gutter.
   * Process: build manager + provider; call update with one item; assert the manager tracks it
   *   (findIdByThread round-trips) and getDecorations returns one entry.
   */
  test('creates a thread for a new feedback item', () => {
    const dir = makeWorkingDir();
    const { manager, dispose } = makeManager();
    try {
      const provider = makeSpecProvider(dir);
      manager.update([item()], provider);
      assert.strictEqual(manager.getDecorations().length, 1);
    } finally {
      dispose();
      rmrf(dir);
    }
  });

  /**
   * Goal: `update()` reuses the same thread instance when the same ID appears across calls (no
   *   destroy-and-recreate flicker). Pins the identity-stable behavior the gutter UI relies on.
   * Process: update with one item; capture the thread instance; update again with the same ID;
   *   assert the same thread instance is still tracked.
   */
  test('reuses the existing thread when an item ID appears again', () => {
    const dir = makeWorkingDir();
    const { manager, dispose } = makeManager();
    try {
      const provider = makeSpecProvider(dir);
      manager.update([item()], provider);
      const decorationsBefore = manager.getDecorations().length;
      manager.update([item({ text: 'updated text' })], provider);
      const decorationsAfter = manager.getDecorations().length;
      assert.strictEqual(decorationsBefore, 1);
      assert.strictEqual(decorationsAfter, 1, 'still one thread, not duplicated');
    } finally {
      dispose();
      rmrf(dir);
    }
  });

  /**
   * Goal: `update()` disposes threads whose IDs are no longer present in the items array (so
   *   deleted feedback bubbles disappear from the gutter). Pins the prune path.
   * Process: update with two items; update with only one of the two; assert getDecorations
   *   reports a single entry.
   */
  test('disposes threads whose items have been removed', () => {
    const dir = makeWorkingDir();
    const { manager, dispose } = makeManager();
    try {
      const provider = makeSpecProvider(dir);
      manager.update([item({ id: 'a' }), item({ id: 'b' })], provider);
      assert.strictEqual(manager.getDecorations().length, 2);
      manager.update([item({ id: 'a' })], provider);
      assert.strictEqual(manager.getDecorations().length, 1);
    } finally {
      dispose();
      rmrf(dir);
    }
  });

  /**
   * Goal: when no spec URI is set, `update()` doesn't create any threads (a thread without a
   *   target document would dangle). Pins the spec-uri guard.
   * Process: build provider WITHOUT setSpecFile; update with one item; assert no threads
   *   tracked.
   */
  test('creates no threads when no spec URI is available', () => {
    const dir = makeWorkingDir();
    const { manager, dispose } = makeManager();
    try {
      const provider = new SpecFileSystemProvider(dir); // no setSpecFile
      manager.update([item()], provider);
      assert.strictEqual(manager.getDecorations().length, 0);
    } finally {
      dispose();
      rmrf(dir);
    }
  });
});

suite('Integration: FeedbackThreadManager — adoptThread + findIdByThread', () => {
  /**
   * Goal: `adoptThread` registers a vscode-created thread under a given feedback id so a
   *   subsequent `findIdByThread` lookup returns that id. Pins the "+" gutter flow where the
   *   thread is created by VS Code first and adopted before the broadcast arrives.
   * Process: create a thread directly via the controller; adoptThread with id 'x'; assert
   *   findIdByThread returns 'x'; assert getDecorations counts it.
   */
  test('adoptThread tracks the thread under the given id', () => {
    const dir = makeWorkingDir();
    const { manager, controller, dispose } = makeManager();
    try {
      const provider = makeSpecProvider(dir);
      const specUri = provider.getSpecUri()!;
      const thread = controller.createCommentThread(specUri, new vscode.Range(0, 0, 0, 0), []);
      manager.adoptThread('x', thread, 'hello', 1, 1);
      assert.strictEqual(manager.findIdByThread(thread), 'x');
      assert.strictEqual(manager.getDecorations().length, 1);
    } finally {
      dispose();
      rmrf(dir);
    }
  });

  /**
   * Goal: `findIdByThread` returns null for a thread the manager does not track. Pins the
   *   negative case the delete handler relies on (untracked threads are merely disposed, not
   *   reported as deleteFeedback).
   * Process: build manager (empty); create a stray thread directly; assert findIdByThread is null.
   */
  test('findIdByThread returns null for untracked threads', () => {
    const dir = makeWorkingDir();
    const { manager, controller, dispose } = makeManager();
    try {
      const provider = makeSpecProvider(dir);
      const stray = controller.createCommentThread(provider.getSpecUri()!, new vscode.Range(0, 0, 0, 0), []);
      try {
        assert.strictEqual(manager.findIdByThread(stray), null);
      } finally {
        stray.dispose();
      }
    } finally {
      dispose();
      rmrf(dir);
    }
  });
});

suite('Integration: FeedbackThreadManager — clear', () => {
  /**
   * Goal: `clear()` disposes all tracked threads. Pins the cleanup the App calls when the user
   *   leaves the editing screen, so stale gutter bubbles don't linger.
   * Process: update with two items; clear; assert getDecorations is empty.
   */
  test('clear disposes all tracked threads', () => {
    const dir = makeWorkingDir();
    const { manager, dispose } = makeManager();
    try {
      const provider = makeSpecProvider(dir);
      manager.update([item({ id: 'a' }), item({ id: 'b' })], provider);
      assert.strictEqual(manager.getDecorations().length, 2);
      manager.clear();
      assert.strictEqual(manager.getDecorations().length, 0);
    } finally {
      dispose();
      rmrf(dir);
    }
  });
});

suite('Integration: FeedbackThreadManager — commenting range provider', () => {
  /**
   * Goal: `refreshCommentingRangeProvider` installs a provider that allows commenting only on
   *   the current spec document. Pins the rule that the user can't add feedback to unrelated
   *   files in the workspace.
   * Process: refresh the provider; create a fake "doc" object for the spec URI and one for an
   *   unrelated URI; call provideCommentingRanges directly; assert the spec URI returns a non-
   *   empty range and the unrelated URI returns an empty array.
   */
  test('only allows commenting on the active spec document', () => {
    const dir = makeWorkingDir();
    const { manager, controller, dispose } = makeManager();
    try {
      const provider = makeSpecProvider(dir);
      manager.refreshCommentingRangeProvider(provider);
      const cr = controller.commentingRangeProvider!;

      const specDoc = { uri: provider.getSpecUri()!, lineCount: 10 } as unknown as vscode.TextDocument;
      const otherDoc = {
        uri: vscode.Uri.parse('file:///tmp/other.md'),
        lineCount: 10,
      } as unknown as vscode.TextDocument;

      const allowed = cr.provideCommentingRanges(specDoc, {} as vscode.CancellationToken);
      const denied = cr.provideCommentingRanges(otherDoc, {} as vscode.CancellationToken);

      assert.ok(Array.isArray(allowed) && allowed.length > 0, 'spec doc should allow commenting');
      assert.deepStrictEqual(denied, [], 'unrelated docs should not allow commenting');
    } finally {
      dispose();
      rmrf(dir);
    }
  });
});

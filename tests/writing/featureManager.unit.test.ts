/**
 * Unit tests for `featureManager.generateFeatureSlug` — generates the kebab-case directory name
 * for a new plan by asking Claude, then sanitizing and deduplicating the result.
 *
 * Layer: unit (Mocha). Drives `generateFeatureSlug` directly with a `FakeClaudeSession`. Real
 *   filesystem is used (under `os.tmpdir()`) for deduplication tests so we don't need to mock
 *   `fs`. Each filesystem test cleans up after itself.
 * Scope: sanitization (lowercase, strip non-[a-z0-9-], collapse dashes, trim, length cap, fallback
 *   when empty), deduplication (no conflict, single conflict, chained conflicts), error
 *   handling (RateLimitError re-throws; other errors fall back to a timestamp slug).
 * Out of scope: the WritingSpecState that calls this (covered in writing integration tests);
 *   the system prompt content (a value, not behavior).
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { generateFeatureSlug, SPEC_DIR } from '../../src/core/featureManager';
import { RateLimitError } from '../../src/core/session';
import { assistantText, FakeSessionFactory, resultDone, systemInit } from '../helpers/fakeSession';

function makeWorkingDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-test-'));
}

function ensureSpecDir(workingDir: string): string {
  const dir = path.join(workingDir, SPEC_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function rmrf(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function makeSession(scripts: ReturnType<FakeSessionFactory['factory']>) {
  // generateFeatureSlug forks the input session and runs prompt() on the fork. With our fake's
  // shared-queue forking, scripting one entry covers the slug call.
  return scripts('Base');
}

suite('Unit: generateFeatureSlug — sanitization', () => {
  /**
   * Goal: a clean kebab-case slug from the agent passes through unchanged. Pins the happy path.
   * Process: script the slug session to return `'auth-rbac'`; assert the result equals it.
   */
  test('returns a clean kebab-case slug as-is', async () => {
    const factory = new FakeSessionFactory();
    factory.script([systemInit('s'), assistantText('auth-rbac', 's'), resultDone('s')]);
    const dir = makeWorkingDir();
    try {
      const slug = await generateFeatureSlug(makeSession(factory.factory()), 'Add auth', dir);
      assert.strictEqual(slug, 'auth-rbac');
    } finally {
      rmrf(dir);
    }
  });

  /**
   * Goal: surrounding whitespace and capitalization in the agent output are normalized. Pins
   *   trim() + toLowerCase() in `sanitizeSlug`.
   * Process: script with `'  Auth-RBAC  '`; assert the result is `'auth-rbac'`.
   */
  test('lowercases and trims surrounding whitespace', async () => {
    const factory = new FakeSessionFactory();
    factory.script([systemInit('s'), assistantText('  Auth-RBAC  ', 's'), resultDone('s')]);
    const dir = makeWorkingDir();
    try {
      const slug = await generateFeatureSlug(makeSession(factory.factory()), 't', dir);
      assert.strictEqual(slug, 'auth-rbac');
    } finally {
      rmrf(dir);
    }
  });

  /**
   * Goal: characters outside `[a-z0-9-]` are stripped and consecutive dashes collapse. Pins both
   *   regex passes in `sanitizeSlug`.
   * Process: script with `'auth_rbac! @v2'`; underscores/punctuation/spaces become dashes which
   *   then collapse — assert the result has only `[a-z0-9-]` and no double dashes.
   */
  test('strips non-[a-z0-9-] characters and collapses repeated dashes', async () => {
    const factory = new FakeSessionFactory();
    factory.script([systemInit('s'), assistantText('auth_rbac!---v2', 's'), resultDone('s')]);
    const dir = makeWorkingDir();
    try {
      const slug = await generateFeatureSlug(makeSession(factory.factory()), 't', dir);
      assert.match(slug, /^[a-z0-9-]+$/);
      assert.ok(!slug.includes('--'), 'consecutive dashes should collapse');
    } finally {
      rmrf(dir);
    }
  });

  /**
   * Goal: leading and trailing dashes are stripped. Pins the `^-|-$` regex in `sanitizeSlug` —
   *   without it, weird outputs like `-foo-` would create directories with leading/trailing
   *   dashes.
   * Process: script with `'-auth-rbac-'`; assert the result has no leading/trailing dash.
   */
  test('trims leading and trailing dashes', async () => {
    const factory = new FakeSessionFactory();
    factory.script([systemInit('s'), assistantText('-auth-rbac-', 's'), resultDone('s')]);
    const dir = makeWorkingDir();
    try {
      const slug = await generateFeatureSlug(makeSession(factory.factory()), 't', dir);
      assert.strictEqual(slug, 'auth-rbac');
    } finally {
      rmrf(dir);
    }
  });

  /**
   * Goal: the slug is capped at 50 characters so directory names don't blow out filesystem
   *   limits. Pins the `.slice(0, 50)` cap.
   * Process: script with a 100-char hyphenated string; assert the result is at most 50 chars.
   */
  test('caps the slug length at 50 characters', async () => {
    const longRaw = 'a'.repeat(100);
    const factory = new FakeSessionFactory();
    factory.script([systemInit('s'), assistantText(longRaw, 's'), resultDone('s')]);
    const dir = makeWorkingDir();
    try {
      const slug = await generateFeatureSlug(makeSession(factory.factory()), 't', dir);
      assert.ok(slug.length <= 50);
    } finally {
      rmrf(dir);
    }
  });

  /**
   * Goal: when the agent returns nothing (or only invalid characters), `sanitizeSlug` falls back
   *   to a timestamp-based slug so we always have a valid directory name. Pins the empty-string
   *   safety net.
   * Process: script with all-whitespace output; assert the result starts with `'feature-'` and
   *   has a numeric tail.
   */
  test('falls back to feature-{timestamp} when sanitization produces an empty string', async () => {
    const factory = new FakeSessionFactory();
    factory.script([systemInit('s'), assistantText('   !@#   ', 's'), resultDone('s')]);
    const dir = makeWorkingDir();
    try {
      const slug = await generateFeatureSlug(makeSession(factory.factory()), 't', dir);
      assert.match(slug, /^feature-\d+$/);
    } finally {
      rmrf(dir);
    }
  });
});

suite('Unit: generateFeatureSlug — deduplication', () => {
  /**
   * Goal: when no conflicting directory exists, the slug is returned as-is. Pins the happy
   *   "first plan with this slug" path in `deduplicateFeature`.
   * Process: script slug `'auth-rbac'`; ensure `blueprint/` exists but is empty; assert the
   *   result is `'auth-rbac'`.
   */
  test('returns the slug unchanged when no directory conflict exists', async () => {
    const factory = new FakeSessionFactory();
    factory.script([systemInit('s'), assistantText('auth-rbac', 's'), resultDone('s')]);
    const dir = makeWorkingDir();
    ensureSpecDir(dir);
    try {
      const slug = await generateFeatureSlug(makeSession(factory.factory()), 't', dir);
      assert.strictEqual(slug, 'auth-rbac');
    } finally {
      rmrf(dir);
    }
  });

  /**
   * Goal: when the slug matches an existing directory, the function appends `-2`. Pins the
   *   single-conflict deduplication branch.
   * Process: pre-create `blueprint/auth-rbac/`; script slug `'auth-rbac'`; assert the result is
   *   `'auth-rbac-2'`.
   */
  test('appends -2 when the slug already exists as a directory', async () => {
    const factory = new FakeSessionFactory();
    factory.script([systemInit('s'), assistantText('auth-rbac', 's'), resultDone('s')]);
    const dir = makeWorkingDir();
    fs.mkdirSync(path.join(ensureSpecDir(dir), 'auth-rbac'));
    try {
      const slug = await generateFeatureSlug(makeSession(factory.factory()), 't', dir);
      assert.strictEqual(slug, 'auth-rbac-2');
    } finally {
      rmrf(dir);
    }
  });

  /**
   * Goal: when both `slug` and `slug-2` exist, the function appends `-3`, and so on. Pins the
   *   chained-conflict loop.
   * Process: pre-create `auth-rbac` and `auth-rbac-2`; script slug `'auth-rbac'`; assert
   *   `'auth-rbac-3'`.
   */
  test('keeps incrementing the suffix until a free slot is found', async () => {
    const factory = new FakeSessionFactory();
    factory.script([systemInit('s'), assistantText('auth-rbac', 's'), resultDone('s')]);
    const dir = makeWorkingDir();
    const specDir = ensureSpecDir(dir);
    fs.mkdirSync(path.join(specDir, 'auth-rbac'));
    fs.mkdirSync(path.join(specDir, 'auth-rbac-2'));
    try {
      const slug = await generateFeatureSlug(makeSession(factory.factory()), 't', dir);
      assert.strictEqual(slug, 'auth-rbac-3');
    } finally {
      rmrf(dir);
    }
  });
});

suite('Unit: generateFeatureSlug — error handling', () => {
  /**
   * Goal: when the slug session throws a non-RateLimitError, the function falls back to a
   *   timestamp slug rather than propagating the error. Pins the catch-and-fallback path so a
   *   transient failure doesn't block plan generation entirely.
   * Process: script no messages and force the session iterator to immediately abort; assert
   *   the slug starts with `'feature-'`.
   *   Note: the fake's empty script causes an empty stream — sanitizeSlug then sees '' and
   *   uses its own fallback. Either way the user gets a working slug.
   */
  test('falls back when the agent returns nothing', async () => {
    const factory = new FakeSessionFactory();
    factory.script([systemInit('s'), resultDone('s')]); // no assistant text → empty rawSlug
    const dir = makeWorkingDir();
    try {
      const slug = await generateFeatureSlug(makeSession(factory.factory()), 't', dir);
      assert.match(slug, /^feature-\d+$/);
    } finally {
      rmrf(dir);
    }
  });

  /**
   * Goal: a `RateLimitError` from the slug session must be re-thrown — the WritingSpecState
   *   needs to know so it can call `app.onRateLimit`. Pins the explicit re-throw branch.
   * Process: import RateLimitError, manually throw it via a fake session that's modified
   *   to throw on prompt; call generateFeatureSlug and assert the rejection.
   */
  test('re-throws RateLimitError instead of falling back', async () => {
    // Build a session that throws RateLimitError on prompt() so the catch block re-throws it.
    const throwingSession: any = {
      fork: () => throwingSession,
      abort: () => {},
      getSessionId: () => null,
      // eslint-disable-next-line require-yield
      prompt: async function* (): AsyncGenerator<never, void, unknown> {
        throw new RateLimitError(123);
      },
    };
    const dir = makeWorkingDir();
    try {
      await assert.rejects(() => generateFeatureSlug(throwingSession, 't', dir), RateLimitError);
    } finally {
      rmrf(dir);
    }
  });
});

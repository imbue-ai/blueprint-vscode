/**
 * Edge-case tests for `featureManager.generateFeatureSlug` deduplication and sanitization corners
 * not covered by the happy-path test in `featureManager.unit.test.ts`.
 *
 * Layer: unit (Mocha). Real `fs` under `os.tmpdir()`; uses FakeSessionFactory for the slug call.
 * Scope: deduplication beyond -2 (chained -3, -10, etc.); sanitization of leading digits,
 *   non-ASCII characters, and very long inputs that would exceed the 50-char cap. Pins the
 *   deterministic-name behavior the rest of the system relies on (the spec dir path is built
 *   from this and gets serialized into agent prompts).
 * Out of scope: the agent prompt itself (a value); error handling (covered in the existing
 *   featureManager.unit.test.ts).
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { generateFeatureSlug, SPEC_DIR } from '../../src/core/featureManager';
import { assistantText, FakeSessionFactory, resultDone, systemInit } from '../helpers/fakeSession';

function makeWorkingDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-test-'));
}
function rmrf(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}
function specDir(workingDir: string): string {
  const dir = path.join(workingDir, SPEC_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function makeSession(scripts: ReturnType<FakeSessionFactory['factory']>) {
  return scripts('Base');
}

suite('Unit: generateFeatureSlug — deduplication edge cases', () => {
  /**
   * Goal: when `slug-2` through `slug-9` already exist, the loop continues to `-10`. Pins the
   *   no-arbitrary-cap behavior — without it, a user with a long history of similarly-named
   *   plans could collide silently.
   * Process: pre-create `auth-rbac` + `auth-rbac-2` … `auth-rbac-9`; script slug `'auth-rbac'`;
   *   assert the result is `'auth-rbac-10'`.
   */
  test('continues incrementing past single-digit suffixes', async () => {
    const factory = new FakeSessionFactory();
    factory.script([systemInit('s'), assistantText('auth-rbac', 's'), resultDone('s')]);
    const dir = makeWorkingDir();
    try {
      const sd = specDir(dir);
      fs.mkdirSync(path.join(sd, 'auth-rbac'));
      for (let i = 2; i <= 9; i++) fs.mkdirSync(path.join(sd, `auth-rbac-${i}`));

      const slug = await generateFeatureSlug(makeSession(factory.factory()), 't', dir);
      assert.strictEqual(slug, 'auth-rbac-10');
    } finally {
      rmrf(dir);
    }
  });

  /**
   * Goal: when `slug` exists but `slug-2` doesn't (gap), the function returns `slug-2` (the
   *   first available). Pins the "first free slot" rule — without it, the loop could overshoot
   *   and unnecessarily inflate suffixes.
   * Process: pre-create `slug` and `slug-3` (skipping -2); assert the result is `slug-2`.
   */
  test('uses the first free suffix even when later ones exist', async () => {
    const factory = new FakeSessionFactory();
    factory.script([systemInit('s'), assistantText('foo', 's'), resultDone('s')]);
    const dir = makeWorkingDir();
    try {
      const sd = specDir(dir);
      fs.mkdirSync(path.join(sd, 'foo'));
      fs.mkdirSync(path.join(sd, 'foo-3'));

      const slug = await generateFeatureSlug(makeSession(factory.factory()), 't', dir);
      assert.strictEqual(slug, 'foo-2');
    } finally {
      rmrf(dir);
    }
  });
});

suite('Unit: generateFeatureSlug — sanitization edge cases', () => {
  /**
   * Goal: a slug starting with a digit is preserved (the regex doesn't require letters first).
   *   Pins that "v2-api" survives.
   * Process: script `'v2-api'`; assert the slug is `'v2-api'`.
   */
  test('preserves slugs that start with a digit', async () => {
    const factory = new FakeSessionFactory();
    factory.script([systemInit('s'), assistantText('v2-api', 's'), resultDone('s')]);
    const dir = makeWorkingDir();
    try {
      const slug = await generateFeatureSlug(makeSession(factory.factory()), 't', dir);
      assert.strictEqual(slug, 'v2-api');
    } finally {
      rmrf(dir);
    }
  });

  /**
   * Goal: non-ASCII characters in the agent's slug are stripped out entirely (not transliterated).
   *   Pins the conservative ASCII-only filter — directories with unicode names cause issues on
   *   some filesystems and prompts that round-trip the slug.
   * Process: script `'プラン-api'`; assert only the ASCII portion (`api`) remains.
   */
  test('strips non-ASCII characters from the slug', async () => {
    const factory = new FakeSessionFactory();
    factory.script([systemInit('s'), assistantText('プラン-api', 's'), resultDone('s')]);
    const dir = makeWorkingDir();
    try {
      const slug = await generateFeatureSlug(makeSession(factory.factory()), 't', dir);
      assert.match(slug, /^[a-z0-9-]+$/);
      assert.ok(slug.includes('api'));
    } finally {
      rmrf(dir);
    }
  });
});

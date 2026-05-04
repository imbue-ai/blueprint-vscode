/**
 * Unit tests for `buildPromptFromConfig` in `src/types/onboarding.ts`.
 *
 * Layer: unit (Mocha, runs inside the Extension Host alongside the integration suite, but uses
 *   no `vscode` API — pure function on data).
 * Scope: this is the pure function that turns a `TemplateConfig` (the shape produced by the
 *   onboarding wizard and the structured template editor) into the prompt body that gets sent
 *   to the writing/editor agents. Every plan generation depends on it. The function has several
 *   subtle behaviors worth pinning: section formatting, fallback for empty titles, depth/style
 *   wording, and the conditional inclusion of the notes section.
 * Out of scope: how the resulting prompt is consumed by Claude (covered by integration tests
 *   for the spec-writing flow); the persistence of the template (covered by `complete.test.ts`).
 */
import * as assert from 'assert';

import type { TemplateConfig } from '../../src/types/onboarding';
import { buildPromptFromConfig } from '../../src/types/onboarding';

const baseConfig: TemplateConfig = {
  sections: [{ id: '1', title: 'Overview', description: 'Of the feature' }],
  styles: ['bullet'],
  depth: 'concise',
  notes: '',
};

suite('Unit: buildPromptFromConfig', () => {
  /**
   * Goal: an empty sections array short-circuits the body — the function returns an empty
   *   string. Pins that the no-sections case doesn't crash and doesn't emit the "EXACTLY the
   *   following sections" preamble against an empty list.
   * Process: call with `sections: []` and empty notes; assert the returned body is empty.
   */
  test('returns empty body when sections is empty', () => {
    assert.strictEqual(buildPromptFromConfig({ ...baseConfig, sections: [] }), '');
  });

  /**
   * Goal: multiple sections render in declaration order, formatted as `- Title: Description`
   *   (or `- Title` when the description is empty). Pins both the ordering and the formatting.
   * Process: call with three sections in a known order; assert all three titles appear in the
   *   body and the order matches the input.
   */
  test('renders sections in order with title and description', () => {
    const sections = [
      { id: '1', title: 'Overview', description: 'High-level summary' },
      { id: '2', title: 'API design', description: 'Endpoints' },
      { id: '3', title: 'Testing', description: '' },
    ];
    const body = buildPromptFromConfig({ ...baseConfig, sections });
    assert.ok(body.includes('- Overview: High-level summary'));
    assert.ok(body.includes('- API design: Endpoints'));
    assert.ok(body.includes('- Testing'));
    assert.ok(body.indexOf('Overview') < body.indexOf('API design'));
    assert.ok(body.indexOf('API design') < body.indexOf('Testing'));
  });

  /**
   * Goal: empty/whitespace-only titles fall back to the literal string `Untitled` so generated
   *   plans don't include malformed bullets like `- :`. Pins both the trim and the fallback.
   * Process: call with one section that has a whitespace-only title; assert the body contains
   *   "- Untitled: Filled".
   */
  test("falls back to 'Untitled' for empty/whitespace titles", () => {
    const body = buildPromptFromConfig({
      ...baseConfig,
      sections: [{ id: '1', title: '   ', description: 'Filled' }],
    });
    assert.ok(body.includes('- Untitled: Filled'));
  });

  /**
   * Goal: the depth setting controls the wording of the depth instruction. `concise` produces
   *   "Be concise and to the point."; `comprehensive` produces "Be comprehensive and detailed."
   *   Pins both branches so a future change has to be deliberate.
   * Process: call with each depth value; assert the appropriate phrase appears and the other
   *   does not.
   */
  test('changes wording between concise and comprehensive depth', () => {
    const concise = buildPromptFromConfig({ ...baseConfig, depth: 'concise' });
    assert.ok(concise.includes('Be concise and to the point.'));
    assert.ok(!concise.includes('Be comprehensive and detailed.'));

    const comprehensive = buildPromptFromConfig({ ...baseConfig, depth: 'comprehensive' });
    assert.ok(comprehensive.includes('Be comprehensive and detailed.'));
    assert.ok(!comprehensive.includes('Be concise and to the point.'));
  });

  /**
   * Goal: the "Additional notes:" block appears only when `notes.trim()` is non-empty. Empty
   *   notes (or whitespace-only) must not produce a header with no content. Pins the gating
   *   so the prompt body stays clean for users who skip the notes field.
   * Process: call with each of '' / '   \n\t' / 'real content'; assert the notes block appears
   *   only in the third case.
   */
  test('includes the notes block only when notes is non-empty after trim', () => {
    assert.ok(!buildPromptFromConfig({ ...baseConfig, notes: '' }).includes('Additional notes:'));
    assert.ok(!buildPromptFromConfig({ ...baseConfig, notes: '   \n\t' }).includes('Additional notes:'));
    const withNotes = buildPromptFromConfig({ ...baseConfig, notes: 'Be brief.' });
    assert.ok(withNotes.includes('Additional notes:'));
    assert.ok(withNotes.includes('Be brief.'));
  });
});

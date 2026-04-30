/**
 * Unit tests for `OnboardingState`'s in-memory message handlers.
 *
 * Layer: unit. Constructs `OnboardingState` directly with a stub `App`; no harness,
 *   no fake sessions, no extension activation logic exercised. (Tests still run in
 *   the Extension Host because `OnboardingState.getScreen()` calls `getModel()`
 *   which reads `vscode.workspace.getConfiguration` — see `setModel.test.ts` for
 *   that integration boundary.)
 * Scope:
 *   - Edge cases: out-of-bounds moves, unknown section ids, empty section list,
 *     fallback behavior on unknown preset keys, id uniqueness.
 *   - Happy paths: update / move / remove targeting, scalar setters (styles,
 *     depth, notes).
 * Out of scope: `setModel` (vscode-config; integration test) and onboarding
 *   completion (workflow; `completion.test.ts`).
 */
import * as assert from 'assert';

import type { App } from '../../src/core/app';
import { OnboardingState } from '../../src/core/states/onboarding';
import type { SpecSection } from '../../src/types/onboarding';
import { PRESET_SECTIONS } from '../../src/types/onboarding';

/**
 * Stub App. OnboardingState only ever calls app.broadcast(); everything else (state, ctx, etc.)
 * is unused for the in-memory mutation paths tested here. setModel is intentionally not covered
 * by these unit tests — it touches vscode config and is exercised in the integration suite.
 */
function stubApp(): App {
  return { broadcast: () => {} } as unknown as App;
}

function sections(state: OnboardingState): SpecSection[] {
  const screen = state.getScreen();
  if (screen.type !== 'onboarding') throw new Error('expected onboarding screen');
  return screen.data.sections;
}

function onboardingData(state: OnboardingState) {
  const screen = state.getScreen();
  if (screen.type !== 'onboarding') throw new Error('expected onboarding screen');
  return screen.data;
}

suite('Unit: OnboardingState — edge cases', () => {
  /**
   * Goal: confirm `moveTemplateSection` is a no-op when asked to move the topmost section up.
   *   Without a guard, the array swap could index into negative territory and silently corrupt order.
   * Process: construct OnboardingState (defaults to two sections); send `moveTemplateSection` with
   *   the first section's id and direction='up'; assert the order is unchanged.
   */
  test('moveTemplateSection up at top edge is a no-op', () => {
    const state = new OnboardingState();
    const app = stubApp();
    const before = sections(state).map((s) => s.id);
    state.handleMessage(app, { type: 'moveTemplateSection', sectionId: before[0], direction: 'up' });
    const after = sections(state).map((s) => s.id);
    assert.deepStrictEqual(after, before, 'order should be unchanged when moving top section up');
  });

  /**
   * Goal: same boundary check, the other direction — moving the bottom section down is a no-op.
   * Process: construct state; pick the last section's id; send `moveTemplateSection` with
   *   direction='down'; assert order unchanged.
   */
  test('moveTemplateSection down at bottom edge is a no-op', () => {
    const state = new OnboardingState();
    const app = stubApp();
    const before = sections(state).map((s) => s.id);
    state.handleMessage(app, { type: 'moveTemplateSection', sectionId: before[before.length - 1], direction: 'down' });
    const after = sections(state).map((s) => s.id);
    assert.deepStrictEqual(after, before);
  });

  /**
   * Goal: `moveTemplateSection` with an id that doesn't exist must not throw or mutate.
   * Process: send the message with a bogus id; assert order unchanged.
   */
  test('moveTemplateSection with unknown sectionId is a no-op', () => {
    const state = new OnboardingState();
    const app = stubApp();
    const before = sections(state).map((s) => s.id);
    state.handleMessage(app, { type: 'moveTemplateSection', sectionId: 'does-not-exist', direction: 'down' });
    const after = sections(state).map((s) => s.id);
    assert.deepStrictEqual(after, before);
  });

  /**
   * Goal: `updateTemplateSection` with an unknown id must not throw or mutate.
   * Process: send update with bogus id; assert sections snapshot unchanged.
   */
  test('updateTemplateSection with unknown sectionId is a no-op', () => {
    const state = new OnboardingState();
    const app = stubApp();
    const before = JSON.stringify(sections(state));
    state.handleMessage(app, {
      type: 'updateTemplateSection',
      sectionId: 'does-not-exist',
      title: 'X',
      description: 'Y',
    });
    assert.strictEqual(JSON.stringify(sections(state)), before);
  });

  /**
   * Goal: `removeTemplateSection` with an unknown id must not throw or mutate.
   * Process: send remove with bogus id; assert sections snapshot unchanged.
   */
  test('removeTemplateSection with unknown sectionId is a no-op', () => {
    const state = new OnboardingState();
    const app = stubApp();
    const before = JSON.stringify(sections(state));
    state.handleMessage(app, { type: 'removeTemplateSection', sectionId: 'does-not-exist' });
    assert.strictEqual(JSON.stringify(sections(state)), before);
  });

  /**
   * Goal: removing every section leaves a coherent empty list (no crash, no negative-length array).
   *   Downstream code (`buildPromptFromConfig`) is supposed to handle `sections: []` gracefully.
   * Process: starting from defaults, remove sections one by one; assert the final list is empty.
   */
  test('removing every section yields an empty section list', () => {
    const state = new OnboardingState();
    const app = stubApp();
    while (sections(state).length > 0) {
      state.handleMessage(app, { type: 'removeTemplateSection', sectionId: sections(state)[0].id });
    }
    assert.strictEqual(sections(state).length, 0);
  });

  /**
   * Goal: every preset key in `PRESET_SECTIONS` produces a section whose title and description
   *   match the preset definition. Catches a silently dropped/renamed preset.
   * Process: for each preset, construct a fresh state, send `addTemplateSection` with that key,
   *   and assert the newly-appended section matches.
   */
  test('every preset key produces a section with matching title and description', () => {
    for (const preset of PRESET_SECTIONS) {
      const state = new OnboardingState();
      const app = stubApp();
      const before = sections(state).length;
      state.handleMessage(app, { type: 'addTemplateSection', presetKey: preset.key });
      const after = sections(state);
      assert.strictEqual(after.length, before + 1, `${preset.key}: should add one section`);
      const added = after[after.length - 1];
      assert.strictEqual(added.title, preset.title, `${preset.key}: title mismatch`);
      assert.strictEqual(added.description, preset.description, `${preset.key}: description mismatch`);
    }
  });

  /**
   * Goal: pin the "Custom" button behavior. The AddSectionMenu's "Custom" entry sends
   *   `addTemplateSection` with `presetKey: null`; this MUST append a blank section (empty title
   *   and description) so the inline editor opens for the user to fill in. Making this a no-op
   *   would silently break the Custom button.
   *   Also covers the defensive fallback: an unrecognized preset key (malformed message, deleted
   *   preset) takes the same code path and produces the same blank section. If we ever want the
   *   unknown-key case to be a no-op or to error, this test will fail and force the change to be
   *   deliberate.
   * Process: for each input — `null` (Custom button) and a bogus string (defensive fallback) —
   *   construct a fresh state, send `addTemplateSection`, and assert the appended section has
   *   empty title and description.
   */
  test('addTemplateSection with null or unknown presetKey appends a blank section', () => {
    for (const presetKey of [null, 'no-such-preset']) {
      const state = new OnboardingState();
      const app = stubApp();
      state.handleMessage(app, { type: 'addTemplateSection', presetKey });
      const last = sections(state)[sections(state).length - 1];
      assert.strictEqual(last.title, '', `presetKey=${presetKey}: title should be empty`);
      assert.strictEqual(last.description, '', `presetKey=${presetKey}: description should be empty`);
    }
  });

  /**
   * Goal: multiple `addTemplateSection` calls produce sections with unique ids (so move/update/remove
   *   can target each one unambiguously).
   * Process: send four adds; collect the section ids; assert all unique.
   */
  test('multiple addTemplateSection calls produce unique section ids', () => {
    const state = new OnboardingState();
    const app = stubApp();
    for (let i = 0; i < 4; i++) {
      state.handleMessage(app, { type: 'addTemplateSection', presetKey: null });
    }
    const ids = sections(state).map((s) => s.id);
    assert.strictEqual(new Set(ids).size, ids.length, 'all section ids should be unique');
  });
});

suite('Unit: OnboardingState — happy paths', () => {
  /**
   * Goal: `updateTemplateSection` overwrites the targeted section's title and description in place
   *   without affecting other sections' order or content.
   * Process: capture default section ids; update the first section; assert the targeted section's
   *   title/description match the inputs and the second section is unchanged.
   */
  test('updateTemplateSection updates the targeted section in place', () => {
    const state = new OnboardingState();
    const app = stubApp();
    const ids = sections(state).map((s) => s.id);
    const secondBefore = { ...sections(state)[1] };
    state.handleMessage(app, {
      type: 'updateTemplateSection',
      sectionId: ids[0],
      title: 'New title',
      description: 'New desc',
    });
    const after = sections(state);
    assert.strictEqual(after[0].title, 'New title');
    assert.strictEqual(after[0].description, 'New desc');
    assert.deepStrictEqual(after[1], secondBefore, 'second section should be untouched');
  });

  /**
   * Goal: `moveTemplateSection` with direction='down' shifts the target one position later in the
   *   array (and the swapped neighbor moves up).
   * Process: capture default section ids (A then B); move A down; assert order is now [B, A].
   */
  test('moveTemplateSection (down) swaps with the next section', () => {
    const state = new OnboardingState();
    const app = stubApp();
    const [aId, bId] = sections(state).map((s) => s.id);
    state.handleMessage(app, { type: 'moveTemplateSection', sectionId: aId, direction: 'down' });
    const after = sections(state).map((s) => s.id);
    assert.deepStrictEqual(after, [bId, aId]);
  });

  /**
   * Goal: `moveTemplateSection` with direction='up' shifts the target one position earlier.
   * Process: capture default section ids (A then B); move B up; assert order is [B, A].
   */
  test('moveTemplateSection (up) swaps with the previous section', () => {
    const state = new OnboardingState();
    const app = stubApp();
    const [aId, bId] = sections(state).map((s) => s.id);
    state.handleMessage(app, { type: 'moveTemplateSection', sectionId: bId, direction: 'up' });
    const after = sections(state).map((s) => s.id);
    assert.deepStrictEqual(after, [bId, aId]);
  });

  /**
   * Goal: `removeTemplateSection` deletes only the targeted section; other sections survive.
   * Process: capture default section ids; remove the first; assert the second is now the only one.
   */
  test('removeTemplateSection deletes the targeted section', () => {
    const state = new OnboardingState();
    const app = stubApp();
    const [aId, bId] = sections(state).map((s) => s.id);
    state.handleMessage(app, { type: 'removeTemplateSection', sectionId: aId });
    const after = sections(state).map((s) => s.id);
    assert.deepStrictEqual(after, [bId]);
  });

  /**
   * Goal: `setTemplateStyles` overwrites the styles array verbatim — it's a setter, not a toggler.
   * Process: send `setTemplateStyles` with `['bullet', 'diagrams']`; assert the screen's styles
   *   array equals that exact value.
   */
  test('setTemplateStyles overwrites the styles array', () => {
    const state = new OnboardingState();
    const app = stubApp();
    state.handleMessage(app, { type: 'setTemplateStyles', styles: ['bullet', 'diagrams'] });
    assert.deepStrictEqual(onboardingData(state).styles, ['bullet', 'diagrams']);
  });

  /**
   * Goal: `setTemplateDepth` switches the depth value. Concise → comprehensive and vice versa.
   * Process: send `setTemplateDepth` with `comprehensive`; assert depth is updated.
   */
  test('setTemplateDepth updates the depth field', () => {
    const state = new OnboardingState();
    const app = stubApp();
    state.handleMessage(app, { type: 'setTemplateDepth', depth: 'comprehensive' });
    assert.strictEqual(onboardingData(state).depth, 'comprehensive');
  });

  /**
   * Goal: `setTemplateNotes` stores the notes string verbatim (whitespace and special characters
   *   preserved on the screen — trimming only happens later in prompt-body generation).
   * Process: send `setTemplateNotes` with multi-line text; assert notes equals the input exactly.
   */
  test('setTemplateNotes stores the notes verbatim', () => {
    const state = new OnboardingState();
    const app = stubApp();
    const text = '  Line one.\nLine two.\n  ';
    state.handleMessage(app, { type: 'setTemplateNotes', notes: text });
    assert.strictEqual(onboardingData(state).notes, text);
  });
});

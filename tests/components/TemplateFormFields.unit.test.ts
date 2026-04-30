/**
 * Unit tests for the validation helpers in `webview/components/TemplateFormFields.tsx`.
 *
 * Layer: unit (Vitest + happy-dom for the DOM-reading helper). No React rendering.
 * Scope: the two functions that decide what counts as "invalid" in onboarding/template forms:
 *   - `getSectionDescription(sections, submitAttempted)` — drives the inline error text/style
 *     in `OnboardingScreen` and `TemplateEditorScreen`. Pure function on the section list.
 *   - `sectionInputsValid()` — reads the live DOM (looks for inputs with
 *     `data-section-title-input` / `data-section-description-input` attrs) to gate the click
 *     handler in both screens. Used because `SectionItem` keeps drafts in local state and
 *     only commits to the host on blur, so the React tree can be stale at click time.
 *   These are the source of truth for "what is whitespace-only / empty input?" — the screen-
 *   level component tests mock these so they don't exercise the `.trim()` calls. This file does.
 * Out of scope: how the screens *use* these helpers (covered in
 *   `tests/components/screens/OnboardingScreen.test.tsx`).
 */
import { afterEach, describe, expect, it } from 'vitest';

import type { SpecSection } from '../../src/types/onboarding';
import { getSectionDescription, sectionInputsValid } from '../../src/webview/components/TemplateFormFields';

const filled: SpecSection = { id: 's1', title: 'Overview', description: 'Of the feature' };

describe('getSectionDescription — empty sections', () => {
  /**
   * Goal: zero sections produces the always-shown "at least one section" error, regardless of
   *   whether the user has attempted submit yet. This is the hard block; other errors gate on
   *   submitAttempted, but this one fires immediately.
   * Process: call with an empty array (both submitAttempted values for thoroughness); assert the
   *   error text and isError=true.
   */
  it('returns the at-least-one-section error for an empty array', () => {
    for (const submitAttempted of [false, true]) {
      const r = getSectionDescription([], submitAttempted);
      expect(r).toEqual({ text: 'At least one section is required', isError: true });
    }
  });
});

describe('getSectionDescription — title validation (after submit)', () => {
  /**
   * Goal: an empty-string title surfaces the "Section title cannot be empty" error after the user
   *   has attempted submit. Pre-submit, no error appears (avoids hostile UX on first paint).
   * Process: build a section with title='' and a filled description; call with submitAttempted=false
   *   then true; assert no error first, then the title error.
   */
  it('flags an empty title only after submit is attempted', () => {
    const sections: SpecSection[] = [{ id: '1', title: '', description: 'Filled' }];
    expect(getSectionDescription(sections, false).isError).toBe(false);
    expect(getSectionDescription(sections, true)).toEqual({
      text: 'Section title cannot be empty',
      isError: true,
    });
  });

  /**
   * Goal: whitespace-only titles must be treated identically to empty strings — the `.trim()`
   *   call in `getSectionDescription` is what enforces this. Without it, "   " would slip past
   *   validation and end up rendered as the section title in generated plans.
   * Process: for several whitespace-only inputs (single spaces, tabs, mixed), call with
   *   submitAttempted=true; assert each yields the title error.
   */
  it('treats whitespace-only titles the same as empty', () => {
    for (const title of ['   ', '\t', '\n', '  \t\n  ']) {
      const sections: SpecSection[] = [{ id: '1', title, description: 'Filled' }];
      expect(getSectionDescription(sections, true)).toEqual({
        text: 'Section title cannot be empty',
        isError: true,
      });
    }
  });
});

describe('getSectionDescription — description validation (after submit)', () => {
  /**
   * Goal: an empty-string description surfaces the description error, but only after submit and
   *   only when all titles are filled. The title check has higher priority in the function — this
   *   test isolates the description path by giving every section a non-empty title.
   * Process: build a section with a filled title but empty description; call with submitAttempted=
   *   false then true; assert no error first, then the description error.
   */
  it('flags an empty description only after submit is attempted', () => {
    const sections: SpecSection[] = [{ id: '1', title: 'Filled', description: '' }];
    expect(getSectionDescription(sections, false).isError).toBe(false);
    expect(getSectionDescription(sections, true)).toEqual({
      text: 'Section description cannot be empty',
      isError: true,
    });
  });

  /**
   * Goal: whitespace-only descriptions are caught the same as empty strings — pins the `.trim()`
   *   on the description side too.
   * Process: for several whitespace-only inputs, call with submitAttempted=true and a filled title;
   *   assert each yields the description error.
   */
  it('treats whitespace-only descriptions the same as empty', () => {
    for (const description of ['   ', '\t', '\n', '  \t\n  ']) {
      const sections: SpecSection[] = [{ id: '1', title: 'Filled', description }];
      expect(getSectionDescription(sections, true)).toEqual({
        text: 'Section description cannot be empty',
        isError: true,
      });
    }
  });
});

describe('getSectionDescription — happy path', () => {
  /**
   * Goal: when all sections have non-whitespace titles and descriptions, no error is returned —
   *   the function falls through to the descriptive summary. Pins that valid input is *not*
   *   reported as an error.
   * Process: call with one fully-filled section and submitAttempted=true; assert isError=false.
   */
  it('returns no error for fully-filled sections', () => {
    const r = getSectionDescription([filled], true);
    expect(r.isError).toBe(false);
  });
});

describe('sectionInputsValid — DOM input validation', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function addTitleInput(value: string): void {
    const input = document.createElement('input');
    input.setAttribute('data-section-title-input', '');
    input.value = value;
    document.body.appendChild(input);
  }

  function addDescriptionInput(value: string): void {
    const input = document.createElement('textarea');
    input.setAttribute('data-section-description-input', '');
    input.value = value;
    document.body.appendChild(input);
  }

  /**
   * Goal: a DOM with no input elements returns valid (vacuous truth — there are no inputs that
   *   could be empty). Pins the documented behavior: the function reports input *invalidity*,
   *   not the existence of inputs.
   * Process: leave the DOM empty; call `sectionInputsValid()`; assert true.
   */
  it('returns true when no section inputs are in the DOM', () => {
    expect(sectionInputsValid()).toBe(true);
  });

  /**
   * Goal: a single empty title input fails validation. Pins the title-empty branch.
   * Process: add an input with `data-section-title-input` and value=''; assert false.
   */
  it('returns false for an empty title input', () => {
    addTitleInput('');
    addDescriptionInput('Filled');
    expect(sectionInputsValid()).toBe(false);
  });

  /**
   * Goal: whitespace-only title inputs fail validation the same as empty strings — pins the
   *   `.trim()` call inside `sectionInputsValid`.
   * Process: for each whitespace input, set up DOM with that title (filled description); assert
   *   each call returns false.
   */
  it('returns false for whitespace-only title inputs', () => {
    for (const title of ['   ', '\t', '\n', '  \t\n  ']) {
      document.body.innerHTML = '';
      addTitleInput(title);
      addDescriptionInput('Filled');
      expect(sectionInputsValid()).toBe(false);
    }
  });

  /**
   * Goal: empty descriptions fail validation when titles are filled. Pins the description-empty
   *   branch.
   * Process: add a filled title and an empty description; assert false.
   */
  it('returns false for an empty description input', () => {
    addTitleInput('Filled');
    addDescriptionInput('');
    expect(sectionInputsValid()).toBe(false);
  });

  /**
   * Goal: whitespace-only descriptions fail validation the same as empty strings — pins the
   *   `.trim()` on the description side.
   * Process: for each whitespace input, set up DOM with filled title and that description;
   *   assert each call returns false.
   */
  it('returns false for whitespace-only description inputs', () => {
    for (const description of ['   ', '\t', '\n', '  \t\n  ']) {
      document.body.innerHTML = '';
      addTitleInput('Filled');
      addDescriptionInput(description);
      expect(sectionInputsValid()).toBe(false);
    }
  });

  /**
   * Goal: a DOM with all inputs filled (non-whitespace) passes validation. Pins the happy path
   *   so a future tightening of the rule (e.g. minimum length) doesn't slip in unannounced.
   * Process: add filled title and description; assert true.
   */
  it('returns true when all section inputs are filled with non-whitespace content', () => {
    addTitleInput('Overview');
    addDescriptionInput('Of the feature');
    expect(sectionInputsValid()).toBe(true);
  });
});

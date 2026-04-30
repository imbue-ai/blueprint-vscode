/**
 * Component tests for `QuestionItem` — the shared interactive component used to render a single
 * question (with multiple input shapes) on both the prompt-refinement screen and the plan-questions
 * panel.
 *
 * Layer: component (Vitest + RTL + happy-dom). Renders QuestionItem in isolation and observes
 *   the `onAnswerChange` callback (the component itself doesn't post messages — its parent
 *   translates the callback into the right `answer*` message for its surface).
 * Scope: every input shape — freeform textarea, single-select (radio + reset), multi-select
 *   (checkboxes), and the "additional context" textfield that appears alongside choices. Plus
 *   frozen (read-only) mode and rendering of the optional context field.
 * Out of scope: the surrounding screens (covered in `screens/PromptRefinementScreen.test.tsx`
 *   and the upcoming plan-questions tests); jump-to-line (covered when the plan-questions
 *   panel gets its own tests).
 */
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { QuestionBase } from '../../src/types/question';
import { QuestionItem } from '../../src/webview/components/QuestionItem';
import { renderComponent } from './helpers/render';

function makeQuestion(overrides: Partial<QuestionBase> = {}): QuestionBase {
  return { text: 'What database?', textAnswer: '', chosenIndices: [], ...overrides };
}

describe('QuestionItem — freeform (no choices)', () => {
  /**
   * Goal: a question with no `choices` renders a textarea (multi-line input). Without this,
   *   open-ended questions would have nowhere for the user to type a long answer.
   * Process: render with no choices; assert exactly one textarea is in the DOM and no radios
   *   or checkboxes appear.
   */
  it('renders a textarea and no choices', () => {
    renderComponent(<QuestionItem question={makeQuestion()} onAnswerChange={vi.fn()} />);
    expect(document.querySelectorAll('textarea').length).toBe(1);
    expect(document.querySelector('input[type="radio"]')).toBeNull();
    expect(document.querySelector('input[type="checkbox"]')).toBeNull();
  });

  /**
   * Goal: typing in the freeform textarea posts the new text via `onAnswerChange`, preserving
   *   `chosenIndices` (which is empty for freeform). Pins the data flow so submissions carry
   *   the typed answer.
   * Process: render; type into the textarea; assert the callback was called with the new text
   *   and an empty array.
   */
  it('typing posts the new text via onAnswerChange', () => {
    const onAnswerChange = vi.fn();
    renderComponent(<QuestionItem question={makeQuestion()} onAnswerChange={onAnswerChange} />);
    const textarea = document.querySelector('textarea')!;
    textarea.value = 'PostgreSQL';
    fireEvent.input(textarea);
    expect(onAnswerChange).toHaveBeenCalledWith('PostgreSQL', []);
  });
});

describe('QuestionItem — single-select (radio + choices)', () => {
  /**
   * Goal: when `choices` is non-empty and `multiSelect` is false/undefined, the component
   *   renders one radio button per choice. Pins the discriminator: choices+!multiSelect → radio.
   * Process: render with two choices; assert two `vscode-radio` elements appear and no
   *   `vscode-checkbox` elements.
   */
  it('renders one radio per choice', () => {
    renderComponent(
      <QuestionItem question={makeQuestion({ choices: ['Postgres', 'MySQL'] })} onAnswerChange={vi.fn()} />,
    );
    expect(document.querySelectorAll('input[type="radio"]').length).toBe(2);
    expect(document.querySelectorAll('input[type="checkbox"]').length).toBe(0);
  });

  /**
   * Goal: clicking a radio choice posts `[index]` via `onAnswerChange`, preserving any text
   *   already typed in the additional-context field. Pins the single-select assignment path.
   * Process: render with two choices; fire change on the second radio; assert the callback was
   *   called with `('', [1])`.
   */
  it('selecting a choice posts [index] via onAnswerChange', () => {
    const onAnswerChange = vi.fn();
    renderComponent(
      <QuestionItem question={makeQuestion({ choices: ['Postgres', 'MySQL'] })} onAnswerChange={onAnswerChange} />,
    );
    const radios = document.querySelectorAll('input[type="radio"]');
    fireEvent.click(radios[1]!);
    expect(onAnswerChange).toHaveBeenCalledWith('', [1]);
  });

  /**
   * Goal: clicking the Reset button explicitly clears the selection (posts `[]`). Pins the
   *   alternative deselect path that doesn't require knowing which choice is selected.
   * Process: render with a selection; click the Reset button; assert callback with `('', [])`.
   */
  it('Reset button clears the selection', () => {
    const onAnswerChange = vi.fn();
    renderComponent(
      <QuestionItem
        question={makeQuestion({ choices: ['Postgres', 'MySQL'], chosenIndices: [1] })}
        onAnswerChange={onAnswerChange}
      />,
    );
    const resetButton = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Reset');
    fireEvent.click(resetButton!);
    expect(onAnswerChange).toHaveBeenCalledWith('', []);
  });
});

describe('QuestionItem — multi-select (checkboxes + choices)', () => {
  /**
   * Goal: when `multiSelect` is true and `choices` is non-empty, the component renders one
   *   checkbox per choice (no radios). Pins the discriminator: choices+multiSelect → checkboxes.
   * Process: render with two choices and `multiSelect: true`; assert checkboxes appear, no
   *   radios.
   */
  it('renders one checkbox per choice', () => {
    renderComponent(
      <QuestionItem
        question={makeQuestion({ choices: ['Postgres', 'MySQL'], multiSelect: true })}
        onAnswerChange={vi.fn()}
      />,
    );
    expect(document.querySelectorAll('input[type="checkbox"]').length).toBe(2);
    expect(document.querySelectorAll('input[type="radio"]').length).toBe(0);
  });

  /**
   * Goal: clicking a checkbox adds its index to `chosenIndices`. Pins the toggle-on path.
   * Process: render with empty `chosenIndices`; fire change on the second checkbox; assert
   *   the callback was called with the new array containing `1`.
   */
  it('toggling a checkbox on adds its index to chosenIndices', () => {
    const onAnswerChange = vi.fn();
    renderComponent(
      <QuestionItem
        question={makeQuestion({ choices: ['Postgres', 'MySQL'], multiSelect: true })}
        onAnswerChange={onAnswerChange}
      />,
    );
    fireEvent.click(document.querySelectorAll('input[type="checkbox"]')[1]!);
    expect(onAnswerChange).toHaveBeenCalledWith('', [1]);
  });

  /**
   * Goal: clicking an already-checked checkbox removes its index. Pins the toggle-off path.
   * Process: render with `chosenIndices: [0, 1]`; fire change on the first checkbox; assert
   *   the callback was called with `('', [1])` (index 0 removed).
   */
  it('toggling a checked checkbox off removes its index', () => {
    const onAnswerChange = vi.fn();
    renderComponent(
      <QuestionItem
        question={makeQuestion({ choices: ['Postgres', 'MySQL'], multiSelect: true, chosenIndices: [0, 1] })}
        onAnswerChange={onAnswerChange}
      />,
    );
    fireEvent.click(document.querySelectorAll('input[type="checkbox"]')[0]!);
    expect(onAnswerChange).toHaveBeenCalledWith('', [1]);
  });
});

describe('QuestionItem — additional context (textfield with choices)', () => {
  /**
   * Goal: when choices exist, a separate textfield appears for "additional context or other
   *   answer". The user can fill BOTH a choice and a freeform context. Pins this mixed-input
   *   layout that's specific to choice-bearing questions.
   * Process: render with choices; assert exactly one `<input>` (Textfield stub) is present
   *   AND a `<textarea>` is NOT present (freeform-only fallback should not render).
   */
  it('renders a textfield alongside choices for additional context', () => {
    renderComponent(
      <QuestionItem question={makeQuestion({ choices: ['Postgres', 'MySQL'] })} onAnswerChange={vi.fn()} />,
    );
    expect(document.querySelectorAll('input[type="text"]').length).toBe(1);
    expect(document.querySelectorAll('textarea').length).toBe(0);
  });

  /**
   * Goal: typing in the additional-context textfield posts the new text via `onAnswerChange`,
   *   preserving the existing `chosenIndices`. Pins that the user can refine a chosen answer
   *   with extra freeform text without losing the selection.
   * Process: render with `chosenIndices: [0]`; type into the textfield; assert the callback
   *   was called with the new text AND the unchanged chosen indices.
   */
  it('typing in the textfield preserves chosenIndices', () => {
    const onAnswerChange = vi.fn();
    renderComponent(
      <QuestionItem
        question={makeQuestion({ choices: ['Postgres', 'MySQL'], chosenIndices: [0] })}
        onAnswerChange={onAnswerChange}
      />,
    );
    const input = document.querySelector('input[type="text"]')! as HTMLInputElement;
    input.value = 'with PostGIS extension';
    fireEvent.input(input);
    expect(onAnswerChange).toHaveBeenCalledWith('with PostGIS extension', [0]);
  });
});

describe('QuestionItem — context display', () => {
  /**
   * Goal: the optional `context` field renders as a smaller paragraph below the question text.
   *   Pins that providing context to the user actually surfaces it visibly.
   * Process: render with `context: 'Used in production'`; assert the context string is in the DOM.
   */
  it('renders the context string when present', () => {
    renderComponent(
      <QuestionItem question={makeQuestion({ context: 'Used in production' })} onAnswerChange={vi.fn()} />,
    );
    expect(document.body.textContent).toContain('Used in production');
  });
});

describe('QuestionItem — frozen (read-only)', () => {
  /**
   * Goal: when `frozen` is true, no inputs render. The user can read the question and answer
   *   but can't change anything. Pins the read-only contract for past rounds.
   * Process: render with `frozen: true` and choices; assert no input/textarea/radio/checkbox
   *   appears.
   */
  it('renders no inputs in frozen mode', () => {
    renderComponent(
      <QuestionItem
        question={makeQuestion({ choices: ['Postgres', 'MySQL'], chosenIndices: [0] })}
        frozen
        onAnswerChange={vi.fn()}
      />,
    );
    expect(document.querySelector('input')).toBeNull();
    expect(document.querySelector('textarea')).toBeNull();
    expect(document.querySelector('input[type="radio"]')).toBeNull();
    expect(document.querySelector('input[type="checkbox"]')).toBeNull();
  });

  /**
   * Goal: frozen mode shows the formatted answer when one exists. Pins that history rounds are
   *   readable, not just blank.
   * Process: render with a chosen index; assert the chosen choice's text appears in the DOM.
   */
  it('shows the formatted answer in frozen mode', () => {
    renderComponent(
      <QuestionItem
        question={makeQuestion({ choices: ['Postgres', 'MySQL'], chosenIndices: [0] })}
        frozen
        onAnswerChange={vi.fn()}
      />,
    );
    expect(document.body.textContent).toContain('Postgres');
  });

  /**
   * Goal: frozen mode shows "No answer provided" when the question wasn't answered. Pins the
   *   empty-state message so historical rounds are clearly labeled.
   * Process: render with no chosenIndices and no textAnswer; assert the empty-state text appears.
   */
  it('shows "No answer provided" when frozen with no answer', () => {
    renderComponent(<QuestionItem question={makeQuestion()} frozen onAnswerChange={vi.fn()} />);
    expect(document.body.textContent).toContain('No answer provided');
  });
});

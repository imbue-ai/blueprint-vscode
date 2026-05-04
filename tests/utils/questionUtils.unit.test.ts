/**
 * Unit tests for the small question-related utility modules.
 *
 * Layer: unit (Mocha). Pure functions; no IO.
 * Modules covered:
 *   - `utils/questionUtils.ts` — `hasAnswer`, `formatAnswer`, `formatQAPairs`. Used to format
 *     answers into the prompt sent to the questioning agent on continuation rounds and into the
 *     spec-edit chat message after panel submit.
 *   - `utils/anchorUtils.ts` — `findAnchorLine`. Locates a question's anchor in the (possibly
 *     edited) spec content so the panel can show a "Line N" jump link and so broken-anchor
 *     questions can be filtered.
 *   - `utils/questionParser.ts` — `parsePartialJsonArray`. Tolerant streaming parser used by the
 *     plan-questions panel to extract objects from in-flight tool output.
 *   - `utils/promptQuestionUtils.ts` — `validatePromptQuestion`. Validates an LLM-produced
 *     question object before it's accepted into the question list.
 */
import * as assert from 'assert';

import { findAnchorLine } from '../../src/utils/anchorUtils';
import { validatePromptQuestion } from '../../src/utils/promptQuestionUtils';
import { parsePartialJsonArray } from '../../src/utils/questionParser';
import { formatAnswer, formatQAPairs, hasAnswer } from '../../src/utils/questionUtils';

suite('Unit: questionUtils — hasAnswer', () => {
  /**
   * Goal: text-only answers count as answered when non-empty after trim. Pins the textarea
   *   answer path.
   */
  test('returns true for non-empty trimmed text', () => {
    assert.strictEqual(hasAnswer({ text: 'q', textAnswer: 'yes', chosenIndices: [] }), true);
  });

  /**
   * Goal: a non-empty `chosenIndices` array also counts (radio/checkbox path). Pins the
   *   choice-only answer path.
   */
  test('returns true when chosenIndices is non-empty', () => {
    assert.strictEqual(hasAnswer({ text: 'q', textAnswer: '', chosenIndices: [0] }), true);
  });

  /**
   * Goal: a whitespace-only `textAnswer` does not count as answered. Pins the trim() check —
   *   without it, a stray space would enable Submit on otherwise-blank questions.
   */
  test('returns false for whitespace-only text + no chosen indices', () => {
    assert.strictEqual(hasAnswer({ text: 'q', textAnswer: '   \n\t', chosenIndices: [] }), false);
  });
});

suite('Unit: questionUtils — formatAnswer', () => {
  /**
   * Goal: chosen choices are joined with ", " for human readability. Pins the multi-select
   *   render rule.
   */
  test('joins chosen choices with ", "', () => {
    const out = formatAnswer({
      text: 'q',
      textAnswer: '',
      chosenIndices: [0, 2],
      choices: ['A', 'B', 'C'],
    });
    assert.strictEqual(out, 'A, C');
  });

  /**
   * Goal: when both choices and a text answer exist, they're separated by ". " (so the prompt
   *   reads as one continuous sentence: "Option A, Option B. Additional context."). Pins the
   *   composed format.
   */
  test('combines choices and text with ". "', () => {
    const out = formatAnswer({
      text: 'q',
      textAnswer: 'plus more',
      chosenIndices: [1],
      choices: ['A', 'B'],
    });
    assert.strictEqual(out, 'B. plus more');
  });

  /**
   * Goal: invalid `chosenIndices` (out of range) are filtered out without throwing. Pins the
   *   defensive lookup the formatter does — without it, a stale index could index into
   *   `choices` as `undefined` and break the join.
   */
  test('drops out-of-range chosenIndices', () => {
    const out = formatAnswer({
      text: 'q',
      textAnswer: '',
      chosenIndices: [0, 99],
      choices: ['A', 'B'],
    });
    assert.strictEqual(out, 'A');
  });
});

suite('Unit: questionUtils — formatQAPairs', () => {
  /**
   * Goal: only answered questions are included; the format is "Q: ... \n\n A: ..." separated by
   *   blank lines. Pins the exact format the questioning agent receives on continuation rounds.
   */
  test('formats only answered questions in Q/A blocks', () => {
    const out = formatQAPairs([
      { text: 'first?', textAnswer: '', chosenIndices: [] },
      { text: 'second?', textAnswer: 'yes', chosenIndices: [] },
      { text: 'third?', textAnswer: 'no', chosenIndices: [] },
    ]);
    assert.ok(out.includes('Q: second?'));
    assert.ok(out.includes('A: yes'));
    assert.ok(out.includes('Q: third?'));
    assert.ok(!out.includes('Q: first?'), 'unanswered question should be omitted');
  });

  /**
   * Goal: with no answered questions, the result is the empty string (callers can short-circuit
   *   the "no continuation needed" path). Pins the empty case.
   */
  test('returns empty string when no questions are answered', () => {
    const out = formatQAPairs([{ text: 'q', textAnswer: '', chosenIndices: [] }]);
    assert.strictEqual(out, '');
  });
});

suite('Unit: anchorUtils — findAnchorLine', () => {
  /**
   * Goal: finds the line number of an exact anchor match (0-indexed). Pins the basic lookup
   *   the questions panel uses to show the "Line N" jump button.
   */
  test('returns the line number of an exact anchor match', () => {
    const spec = '# Title\n\nSome text\n## Anchor here\nMore text\n';
    assert.strictEqual(findAnchorLine(spec, '## Anchor here'), 3);
  });

  /**
   * Goal: matching is case-insensitive AND ignores non-alphanumeric/newline characters. Pins
   *   the normalization used to tolerate light spec edits (added punctuation, casing changes).
   */
  test('matching is case-insensitive and tolerates punctuation', () => {
    const spec = 'Line 0\n## Anchor TITLE!\nLine 2\n';
    assert.strictEqual(findAnchorLine(spec, 'anchor title'), 1);
  });

  /**
   * Goal: returns -1 when the anchor is not findable. Pins the negative case used by the panel
   *   to filter broken-anchor questions in non-frozen rounds.
   */
  test('returns -1 when the anchor is not present', () => {
    assert.strictEqual(findAnchorLine('# A\n# B\n', 'something else'), -1);
  });

  /**
   * Goal: an empty (or punctuation-only) anchor returns -1 rather than matching everything. Pins
   *   the defensive guard that prevents an empty anchor from matching at line 0 of every spec.
   */
  test('returns -1 for an empty or punctuation-only anchor', () => {
    assert.strictEqual(findAnchorLine('# A\n', ''), -1);
    assert.strictEqual(findAnchorLine('# A\n', '!!!'), -1);
  });
});

suite('Unit: questionParser — parsePartialJsonArray', () => {
  /**
   * Goal: returns each complete object inside the array, in order. Pins the basic streaming-
   *   parse case where the stream has finished one or more objects.
   */
  test('extracts complete objects from a finished array', () => {
    const text = '[{"text": "first"}, {"text": "second"}]';
    const items = parsePartialJsonArray<{ text: string }>(text, (o) =>
      typeof o === 'object' && o !== null ? (o as { text: string }) : null,
    );
    assert.strictEqual(items.length, 2);
    assert.strictEqual(items[0].text, 'first');
    assert.strictEqual(items[1].text, 'second');
  });

  /**
   * Goal: returns only the complete objects when the stream is mid-emission (the trailing
   *   partial object is skipped until it's complete). Pins the partial-tolerant behavior — this
   *   is what makes the question panel render incrementally instead of all-at-once.
   */
  test('skips an incomplete trailing object', () => {
    const text = '[{"text": "complete"}, {"text": "in';
    const items = parsePartialJsonArray<{ text: string }>(text, (o) =>
      typeof o === 'object' && o !== null ? (o as { text: string }) : null,
    );
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].text, 'complete');
  });

  /**
   * Goal: returns `[]` when there is no opening bracket yet (the stream is still emitting
   *   prefix text). Pins the no-array-yet case.
   */
  test('returns [] when the array start is not present', () => {
    const items = parsePartialJsonArray('not yet json', () => null);
    assert.deepStrictEqual(items, []);
  });

  /**
   * Goal: items that fail validation are silently dropped. Pins the validator filter — the
   *   parser tolerates malformed objects without aborting the whole batch.
   */
  test('drops items the validator rejects', () => {
    const text = '[{"text": "ok"}, {"missing": true}]';
    const items = parsePartialJsonArray<{ text: string }>(text, (o) =>
      typeof o === 'object' && o !== null && typeof (o as Record<string, unknown>).text === 'string'
        ? (o as { text: string })
        : null,
    );
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].text, 'ok');
  });
});

suite('Unit: promptQuestionUtils — validatePromptQuestion', () => {
  /**
   * Goal: a minimal valid question (text only) is accepted and gets the standard default fields.
   *   Pins the canonical normalization the parser produces.
   */
  test('accepts a minimal text-only question and seeds default fields', () => {
    const out = validatePromptQuestion({ text: 'hello?' });
    assert.ok(out);
    assert.strictEqual(out!.text, 'hello?');
    assert.strictEqual(out!.textAnswer, '');
    assert.deepStrictEqual(out!.chosenIndices, []);
    assert.strictEqual(out!.choices, undefined);
  });

  /**
   * Goal: a question with valid choices is normalized so `choices` is set and `multiSelect`
   *   reflects the boolean. Pins the choice-list path.
   */
  test('passes through valid choices and multiSelect flag', () => {
    const out = validatePromptQuestion({
      text: 'pick',
      choices: ['A', 'B'],
      multiSelect: true,
    });
    assert.deepStrictEqual(out!.choices, ['A', 'B']);
    assert.strictEqual(out!.multiSelect, true);
  });

  /**
   * Goal: non-string entries in `choices` are filtered out, and a resulting empty `choices`
   *   array drops the field entirely (so single-text fallback rendering kicks in). Pins the
   *   defensive coercion.
   */
  test('drops non-string choices and unsets choices when none remain', () => {
    const out = validatePromptQuestion({ text: 'q', choices: [1, 2, null] });
    assert.strictEqual(out!.choices, undefined);
  });

  /**
   * Goal: returns `null` for entirely invalid input (non-object, missing text). Pins the
   *   negative case the parser uses to filter LLM hallucinations.
   */
  test('returns null for invalid inputs', () => {
    assert.strictEqual(validatePromptQuestion(null), null);
    assert.strictEqual(validatePromptQuestion('string'), null);
    assert.strictEqual(validatePromptQuestion({}), null);
    assert.strictEqual(validatePromptQuestion({ text: 42 }), null);
  });
});

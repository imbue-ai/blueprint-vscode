/**
 * Unit tests for `parseQuestionXml` — the streaming-aware parser that extracts `<question>` JSON
 * blocks from the questioning agent's text output.
 *
 * Layer: unit (Mocha). Pure function on strings.
 * Scope: every behavior the parser is responsible for: well-formed questions, multiple questions,
 *   plain text, partial input (open tag without close), invalid JSON, no-question input. The
 *   parser is called repeatedly during streaming, so partial-input handling and the `remainder`
 *   contract are critical.
 * Out of scope: how the parser's output is consumed by the questioning state machine (covered
 *   in `tests/prompt/submit.test.ts`).
 */
import * as assert from 'assert';

import { parseQuestionXml } from '../../src/core/xmlQuestionParser';

const wellFormed = (json: object) => `<question>\n${JSON.stringify(json)}\n</question>`;

suite('Unit: parseQuestionXml', () => {
  /**
   * Goal: text with no `<question>` tags returns no segments and the entire input as remainder.
   *   The remainder contract lets the caller hold the buffer until a tag arrives.
   * Process: parse `'just some text'`; assert empty segments and remainder equals input.
   */
  test('returns the input as remainder when there are no question tags', () => {
    const r = parseQuestionXml('just some text');
    assert.deepStrictEqual(r.segments, []);
    assert.strictEqual(r.remainder, 'just some text');
  });

  /**
   * Goal: a complete `<question>...</question>` block produces one `question` segment, validated
   *   via `validatePromptQuestion`. Pins the happy path and the validation hook-up.
   * Process: parse a string with one well-formed question; assert a single question segment with
   *   matching text/choices, and an empty remainder.
   */
  test('parses a single well-formed question into a question segment', () => {
    const json = { text: 'What database?', choices: ['Postgres', 'MySQL'] };
    const r = parseQuestionXml(wellFormed(json));
    assert.strictEqual(r.segments.length, 1);
    assert.strictEqual(r.segments[0].type, 'question');
    if (r.segments[0].type === 'question') {
      assert.strictEqual(r.segments[0].question.text, 'What database?');
      assert.deepStrictEqual(r.segments[0].question.choices, ['Postgres', 'MySQL']);
    }
    assert.strictEqual(r.remainder, '');
  });

  /**
   * Goal: text + question + text + question produces alternating segments in order. Pins the
   *   interleaving used to render explanatory prose around questions in the UI.
   * Process: parse `'Intro\n<q1>\nMore prose\n<q2>'`; assert four segments in the right order.
   */
  test('parses interleaved text and questions in order', () => {
    const text =
      'Intro prose\n' + wellFormed({ text: 'Q1' }) + '\nMore prose\n' + wellFormed({ text: 'Q2' }) + '\nTrailing';
    const r = parseQuestionXml(text);
    assert.strictEqual(r.segments.length, 5);
    assert.strictEqual(r.segments[0].type, 'text');
    assert.strictEqual(r.segments[1].type, 'question');
    assert.strictEqual(r.segments[2].type, 'text');
    assert.strictEqual(r.segments[3].type, 'question');
    assert.strictEqual(r.segments[4].type, 'text');
    if (r.segments[0].type === 'text') assert.strictEqual(r.segments[0].content, 'Intro prose');
    if (r.segments[2].type === 'text') assert.strictEqual(r.segments[2].content, 'More prose');
    if (r.segments[4].type === 'text') assert.strictEqual(r.segments[4].content, 'Trailing');
  });

  /**
   * Goal: a partially-streamed `<question>` (open tag, no close yet) returns segments parsed
   *   so far PLUS the unfinished open-tag-onwards as `remainder`. The caller buffers the
   *   remainder and re-parses when more chunks arrive. This is the critical streaming contract.
   * Process: parse `'<question>\n{...incomplete'`; assert empty segments and remainder starts at
   *   the open tag.
   */
  test('returns the partial question as remainder when the close tag has not arrived yet', () => {
    const partial = '<question>\n{"text": "incomplete';
    const r = parseQuestionXml(partial);
    assert.deepStrictEqual(r.segments, []);
    assert.strictEqual(r.remainder, partial);
  });

  /**
   * Goal: text BEFORE a partial open tag IS emitted as a text segment, even though the question
   *   itself is incomplete. Pins the streaming contract: don't wait on partial questions to flush
   *   text the caller has already seen.
   * Process: parse `'Intro prose\n<question>\n{partial'`; assert one text segment ('Intro prose')
   *   and the remainder starts at `<question>`.
   */
  test('emits prefix text even when a trailing question is partial', () => {
    const r = parseQuestionXml('Intro prose\n<question>\n{"text": "incomplete');
    assert.strictEqual(r.segments.length, 1);
    assert.strictEqual(r.segments[0].type, 'text');
    if (r.segments[0].type === 'text') assert.strictEqual(r.segments[0].content, 'Intro prose');
    assert.ok(r.remainder.startsWith('<question>'));
  });

  /**
   * Goal: a `<question>...</question>` block with invalid JSON falls through to a `text` segment
   *   containing the raw inner content, rather than dropping it or throwing. Pins the defensive
   *   fallback so a malformed agent output doesn't silently swallow text.
   * Process: parse a block with non-JSON inside; assert a text segment with the inner content.
   */
  test('falls back to a text segment when the JSON inside is invalid', () => {
    const r = parseQuestionXml('<question>\nthis is not json\n</question>');
    assert.strictEqual(r.segments.length, 1);
    assert.strictEqual(r.segments[0].type, 'text');
    if (r.segments[0].type === 'text') assert.ok(r.segments[0].content.includes('this is not json'));
  });

  /**
   * Goal: a question whose JSON parses but fails `validatePromptQuestion` (e.g. missing `text`
   *   field) is silently dropped — neither a text nor a question segment. Pins the validation
   *   gate so junk doesn't reach the UI.
   * Process: parse a block with valid JSON that's missing the `text` field; assert no segments.
   */
  test('drops segments whose JSON fails question validation', () => {
    const r = parseQuestionXml('<question>\n{"choices": ["A","B"]}\n</question>');
    assert.strictEqual(r.segments.length, 0);
  });
});

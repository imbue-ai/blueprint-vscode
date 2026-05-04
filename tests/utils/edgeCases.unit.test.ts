/**
 * Edge-case tests for utility modules whose happy paths are covered by other unit tests but
 * whose corners (multibyte, embedded braces, duplicate matches, etc.) aren't.
 *
 * Layer: unit (Mocha). Pure functions; no IO.
 * Modules covered:
 *   - `utils/anchorUtils.ts` — `findAnchorLine` with duplicate matches, multibyte content,
 *     CRLF line endings, leading whitespace.
 *   - `utils/questionParser.ts` — `parsePartialJsonArray` with strings containing braces,
 *     deeply nested objects, and unicode.
 *   - `utils/toolUse.ts` — `extractToolUseFromContent` with multiple tool_use blocks (returns
 *     first), with mixed text + tool_use ordering.
 *   - `utils/questionUtils.ts` — `formatAnswer` with embedded newlines and quote characters.
 */
import * as assert from 'assert';

import { findAnchorLine } from '../../src/utils/anchorUtils';
import { parsePartialJsonArray } from '../../src/utils/questionParser';
import { formatAnswer } from '../../src/utils/questionUtils';
import { extractToolUseFromContent } from '../../src/utils/toolUse';

suite('Unit: anchorUtils.findAnchorLine — edge cases', () => {
  /**
   * Goal: with a duplicate anchor in the spec, `findAnchorLine` returns the *first* occurrence.
   *   Pins the deterministic-first-match behavior used by question anchoring — without it, the
   *   "Line N" jump button could surprise the user by jumping to a later (less relevant) match.
   * Process: spec with the same heading text on two lines; assert the returned line is the
   *   first one.
   */
  test('returns the first occurrence for a duplicate anchor', () => {
    const spec = '# Title\n\n## Section\nContent A\n## Section\nContent B\n';
    assert.strictEqual(findAnchorLine(spec, '## Section'), 2);
  });

  /**
   * Goal: CRLF line endings count as a single newline boundary so the line count stays correct.
   *   Pins behavior on Windows-edited files — without this the line numbers would be off by
   *   roughly the count of CRLF pairs above the match.
   * Process: spec with CRLF endings; locate an anchor on line 3; assert findAnchorLine returns 2
   *   (zero-indexed).
   */
  test('handles CRLF line endings without inflating the line count', () => {
    const spec = 'Line 0\r\nLine 1\r\n## Anchor\r\nLine 3\r\n';
    assert.strictEqual(findAnchorLine(spec, '## Anchor'), 2);
  });

  /**
   * Goal: multibyte unicode in the anchor and the spec is dropped by the normalizer (it's not
   *   in `[a-z0-9\n]`). So a CJK-only anchor matches an empty normalized string and returns
   *   -1 (the empty-anchor guard kicks in). Pins the documented limitation: anchors must
   *   include some ASCII alphanumerics. Without this test, a future refactor that "fixes"
   *   unicode support would silently break the broken-anchor filtering.
   * Process: spec and anchor that are entirely CJK; assert -1.
   */
  test('CJK-only anchor returns -1 (normalizer drops non-ASCII alphanumerics)', () => {
    assert.strictEqual(findAnchorLine('プラン\nセクション\n', 'セクション'), -1);
  });

  /**
   * Goal: an anchor with surrounding whitespace still matches because the normalizer drops
   *   spaces. Pins the lenient match used when the agent generates anchor strings with
   *   slightly different whitespace than the spec.
   * Process: spec has `## Section`; anchor is `   Section   `; assert it matches.
   */
  test('whitespace around the anchor is ignored by the normalizer', () => {
    const spec = '# Title\n## Section\n';
    assert.strictEqual(findAnchorLine(spec, '   Section   '), 1);
  });
});

suite('Unit: questionParser.parsePartialJsonArray — edge cases', () => {
  /**
   * Goal: a string value containing `{` or `}` doesn't confuse the brace counter into thinking
   *   the object is incomplete or extra-nested. Pins the JSON-aware parser even though the
   *   implementation looks like a naive bracket-counter.
   *
   *   NOTE: the current implementation is a naive bracket-counter and does NOT handle braces
   *   inside string literals — this test documents the current behavior so the limitation is
   *   visible, even though it's a known weakness. If the parser is upgraded to be string-aware,
   *   this test should flip to assert successful parsing.
   * Process: input like `[{"text": "has } brace"}]`; observe what the parser returns and pin
   *   the (current) behavior.
   */
  test('current parser is naive about braces inside string values (documents limitation)', () => {
    const text = '[{"text": "has } brace"}]';
    const items = parsePartialJsonArray<{ text: string }>(text, (o) =>
      typeof o === 'object' && o !== null && typeof (o as Record<string, unknown>).text === 'string'
        ? (o as { text: string })
        : null,
    );
    // The naive counter treats the `}` inside the string as the closing brace of the object,
    // tries to JSON.parse `{"text": "has }`, fails, and recovers — net effect is items.length
    // is 0 for this pathological input. If you upgrade to a string-aware scanner, this should
    // become 1.
    assert.strictEqual(items.length, 0);
  });

  /**
   * Goal: deeply nested objects parse correctly when the outer braces are balanced. Pins that
   *   the depth counter doesn't bottom out early for complex shapes the agent might emit.
   * Process: input with `{"a": {"b": {"c": 1}}}`; assert one validated item.
   */
  test('deeply nested objects parse when braces balance', () => {
    const text = '[{"a": {"b": {"c": 1}}}]';
    const items = parsePartialJsonArray<{ a: unknown }>(text, (o) =>
      typeof o === 'object' && o !== null && 'a' in o ? (o as { a: unknown }) : null,
    );
    assert.strictEqual(items.length, 1);
  });

  /**
   * Goal: unicode in string values is preserved through JSON.parse. Pins the string-content
   *   pass-through.
   * Process: input with a CJK character; assert the validated item carries the same string.
   */
  test('unicode in string values round-trips via JSON.parse', () => {
    const text = '[{"text": "プラン"}]';
    const items = parsePartialJsonArray<{ text: string }>(text, (o) =>
      typeof o === 'object' && o !== null && typeof (o as Record<string, unknown>).text === 'string'
        ? (o as { text: string })
        : null,
    );
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].text, 'プラン');
  });
});

suite('Unit: toolUse.extractToolUseFromContent — edge cases', () => {
  /**
   * Goal: when multiple tool_use blocks exist in one content array, only the first is returned.
   *   Pins the documented one-tool-per-message convention — Claude's API normally emits a
   *   single tool_use per assistant turn, but the extractor is lenient and handles multi-block
   *   content without throwing.
   * Process: array with two tool_use blocks; assert the first one is returned.
   */
  test('returns the first tool_use when multiple are present', () => {
    const tu1 = { type: 'tool_use', name: 'Read', input: { file_path: '/a.md' } };
    const tu2 = { type: 'tool_use', name: 'Edit', input: { file_path: '/b.md' } };
    const found = extractToolUseFromContent([tu1, tu2]);
    assert.deepStrictEqual(found, tu1);
  });

  /**
   * Goal: text → tool_use → text mixed orderings still find the tool_use. Pins that ordering of
   *   text/tool blocks doesn't break the find.
   * Process: array `[text, tool_use, text]`; assert tool_use is returned.
   */
  test('finds tool_use sandwiched between text blocks', () => {
    const tu = { type: 'tool_use', name: 'Glob', input: { pattern: '*.ts' } };
    const found = extractToolUseFromContent([{ type: 'text', text: 'before' }, tu, { type: 'text', text: 'after' }]);
    assert.deepStrictEqual(found, tu);
  });
});

suite('Unit: questionUtils.formatAnswer — edge cases', () => {
  /**
   * Goal: a textAnswer with embedded newlines is preserved as-is in the formatted output. Pins
   *   the contract that the agent receives the user's full multi-line answer (not collapsed to
   *   a single line).
   * Process: textAnswer with `\n`; assert it appears verbatim in the formatted string.
   */
  test('preserves embedded newlines in textAnswer', () => {
    const out = formatAnswer({
      text: 'q',
      textAnswer: 'line1\nline2',
      chosenIndices: [],
    });
    assert.strictEqual(out, 'line1\nline2');
  });

  /**
   * Goal: a textAnswer containing quote characters round-trips without escaping (we're building
   *   a plain prompt string, not JSON). Pins the unescaped pass-through.
   * Process: textAnswer with `"` and `'`; assert the raw characters appear.
   */
  test('preserves quote characters verbatim', () => {
    const out = formatAnswer({
      text: 'q',
      textAnswer: `He said "hi" and 'bye'`,
      chosenIndices: [],
    });
    assert.strictEqual(out, `He said "hi" and 'bye'`);
  });
});

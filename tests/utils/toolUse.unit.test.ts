/**
 * Unit tests for `utils/toolUse.ts` — the bridge between Claude SDK tool-use messages and the
 * `tool_call` StreamItem rendered in the activity stream.
 *
 * Layer: unit (Mocha). Pure functions; no IO.
 * Scope: `extractToolUseFromContent` finds the first tool_use block in the content array and
 *   filters non-tool-use blocks; `createToolCallStreamItem` derives a per-tool summary, hides
 *   the spec-template temp-file write (so the user doesn't see it), and strips noisy args (e.g.
 *   the `description` field on Bash).
 * Out of scope: the streaming logic that consumes these (covered in editing/writing state tests
 *   via integration); the StreamItem rendering (covered in `ActivityStream.test.tsx`).
 */
import * as assert from 'assert';

import { createToolCallStreamItem, extractToolUseFromContent } from '../../src/utils/toolUse';

suite('Unit: extractToolUseFromContent', () => {
  /**
   * Goal: returns the first tool_use block from a mixed content array. Pins the basic find-by-
   *   type behavior — Claude's `assistant` content is a list of typed blocks (text + tool_use)
   *   and only one tool_use is expected per assistant message.
   * Process: pass an array with a text block then a tool_use; assert the tool_use is returned.
   */
  test('returns the tool_use block when present', () => {
    const tu = { type: 'tool_use', name: 'Read', input: { file_path: '/x.md' } };
    const found = extractToolUseFromContent([{ type: 'text', text: 'hi' }, tu]);
    assert.deepStrictEqual(found, tu);
  });

  /**
   * Goal: returns null when no tool_use is in the content array. Pins the negative case so
   *   callers can defensively skip pure-text assistant messages.
   * Process: pass an array of only text blocks; assert null.
   */
  test('returns null when no tool_use is present', () => {
    const found = extractToolUseFromContent([{ type: 'text', text: 'just words' }]);
    assert.strictEqual(found, null);
  });

  /**
   * Goal: tolerates malformed entries (non-objects, nulls) without throwing. Pins the type-
   *   guarding the find callback does — Claude's content is `unknown[]` from the SDK's
   *   perspective.
   * Process: pass null and a string alongside a real tool_use; assert it still returns the
   *   tool_use.
   */
  test('skips malformed entries and finds the real tool_use', () => {
    const tu = { type: 'tool_use', name: 'Glob', input: { pattern: '*.ts' } };
    const found = extractToolUseFromContent([null, 'oops', tu]);
    assert.deepStrictEqual(found, tu);
  });
});

suite('Unit: createToolCallStreamItem — summary derivation', () => {
  /**
   * Goal: Read/Edit/Write tools summarize as the basename of `file_path` so the activity stream
   *   shows the file name without the noisy absolute path. Pins the most common rendering rule.
   * Process: build an item for each; assert the summary is the basename only.
   */
  test('Read/Edit/Write summary is the basename of file_path', () => {
    for (const name of ['Read', 'Edit', 'Write'] as const) {
      const item = createToolCallStreamItem(name, { file_path: '/Users/x/proj/spec.md' });
      assert.strictEqual(item?.summary, 'spec.md');
    }
  });

  /**
   * Goal: Glob and Grep summarize as the search pattern. Pins the search-tool rendering.
   * Process: build an item for each; assert summary equals the pattern.
   */
  test('Glob and Grep summary is the pattern', () => {
    const glob = createToolCallStreamItem('Glob', { pattern: '*.ts' });
    const grep = createToolCallStreamItem('Grep', { pattern: 'TODO' });
    assert.strictEqual(glob?.summary, '*.ts');
    assert.strictEqual(grep?.summary, 'TODO');
  });

  /**
   * Goal: WebSearch summarizes as the query and WebFetch shows a fixed "Fetching page" label
   *   (since the URL is too long to display as a single-line summary). Pins both web-tool
   *   rules.
   * Process: build an item for each; assert summary text.
   */
  test('WebSearch shows the query; WebFetch shows a fixed label', () => {
    const search = createToolCallStreamItem('WebSearch', { query: 'rust async' });
    const fetch = createToolCallStreamItem('WebFetch', { url: 'https://example.com/long-path' });
    assert.strictEqual(search?.summary, 'rust async');
    assert.strictEqual(fetch?.summary, 'Fetching page');
  });

  /**
   * Goal: an unknown tool name falls back to the first string-typed input value as a best-effort
   *   summary, with empty string when no string args exist. Pins the catch-all that prevents
   *   future tools from showing nothing.
   * Process: build with an unknown tool + a numeric arg + a string arg; assert the string is
   *   used. Then build with all-numeric args; assert empty string.
   */
  test('unknown tools fall back to the first string arg, or empty string', () => {
    const withStr = createToolCallStreamItem('Custom', { count: 3, label: 'something' });
    const noStr = createToolCallStreamItem('Custom', { count: 3 });
    assert.strictEqual(withStr?.summary, 'something');
    assert.strictEqual(noStr?.summary, '');
  });
});

suite('Unit: createToolCallStreamItem — display filtering', () => {
  /**
   * Goal: writes to the `blueprint-spec-template-*.md` temp file (used internally to seed the
   *   editing agent's view of the template) are hidden from the activity stream. Pins the
   *   filter that prevents users from seeing internal scaffolding.
   * Process: build a Write call whose file_path includes that prefix; assert null.
   */
  test('hides Write calls to the blueprint-spec-template temp file', () => {
    const item = createToolCallStreamItem('Write', { file_path: '/tmp/blueprint-spec-template-12345.md' });
    assert.strictEqual(item, null);
  });

  /**
   * Goal: Bash's noisy `description` arg is stripped from the displayed args (the Bash command
   *   itself remains). Pins the Bash arg filter that keeps tooltips concise.
   * Process: build a Bash call with description + command; assert description is gone but
   *   command survives.
   */
  test('strips Bash description from args', () => {
    const item = createToolCallStreamItem('Bash', { command: 'ls -la', description: 'list files' });
    assert.ok(item, 'item should be created');
    assert.strictEqual('command' in item!.args, true);
    assert.strictEqual('description' in item!.args, false);
  });

  /**
   * Goal: `name` and `summary` are both included on the resulting StreamItem. Pins the shape
   *   the activity stream consumes.
   * Process: build a Read; assert type/name/summary fields.
   */
  test('produced StreamItem has type/name/summary set', () => {
    const item = createToolCallStreamItem('Read', { file_path: '/x.md' });
    assert.strictEqual(item?.type, 'tool_call');
    assert.strictEqual(item?.name, 'Read');
    assert.strictEqual(item?.summary, 'x.md');
  });
});

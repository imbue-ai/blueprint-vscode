/**
 * Unit tests for the questioning-phase prompt builders in `core/prompts.ts`.
 *
 * Layer: unit (Mocha). Pure functions; no `vscode` API used.
 * Scope: `interpolatePrompt`, `getQuestionPrompt`, `getQuestionContinuePrompt`. These build the
 *   prompts sent to the questioning agent on round 1 (initial) and rounds 2+ (continuation).
 *   A breaking change to either silently sends the wrong instructions to Claude on every plan.
 * Out of scope: writing-phase / editing-phase prompt builders (covered when those phases get
 *   tests); the underlying defaults (`promptDefaults.ts`) are values, not behavior.
 */
import * as assert from 'assert';

import { getQuestionContinuePrompt, getQuestionPrompt, interpolatePrompt } from '../../src/core/prompts';

suite('Unit: interpolatePrompt', () => {
  /**
   * Goal: `{{key}}` placeholders are replaced with the matching variable value. Pins the basic
   *   substitution that all prompt builders rely on.
   * Process: interpolate `'Hello {{name}}'` with `{ name: 'world' }`; assert the placeholder
   *   was replaced.
   */
  test('replaces {{key}} placeholders with variable values', () => {
    assert.strictEqual(interpolatePrompt('Hello {{name}}', { name: 'world' }), 'Hello world');
  });

  /**
   * Goal: missing keys are replaced with empty string (not left as `{{key}}`). Pins the lenient
   *   fallback so a partial vars object doesn't leave unrendered template syntax in the prompt.
   * Process: interpolate `'Hi {{a}} {{b}}'` with `{ a: 'X' }`; assert `{{b}}` becomes empty.
   */
  test('replaces missing variables with empty string', () => {
    assert.strictEqual(interpolatePrompt('Hi {{a}} {{b}}', { a: 'X' }), 'Hi X ');
  });

  /**
   * Goal: a key referenced multiple times is replaced everywhere (not just the first occurrence).
   *   Pins the global-replace behavior — important for templates that repeat the user's prompt
   *   in multiple sections.
   * Process: interpolate a string with two `{{x}}` instances; assert both were replaced.
   */
  test('replaces all occurrences of a key', () => {
    assert.strictEqual(interpolatePrompt('{{x}} and {{x}}', { x: 'A' }), 'A and A');
  });
});

suite('Unit: getQuestionPrompt (initial round)', () => {
  /**
   * Goal: the user's feature description is substituted into the prompt sent to the questioning
   *   agent on the first round. Pins that the agent sees the user's actual request, not the raw
   *   template placeholder.
   * Process: build a prompt with a recognizable user prompt; assert it appears in the output and
   *   the placeholder does not.
   */
  test('substitutes the userPrompt into the template', () => {
    const out = getQuestionPrompt('Add OAuth login', '/tmp/template.md');
    assert.ok(out.includes('Add OAuth login'), 'output should include the user prompt');
    assert.ok(!out.includes('{{userPrompt}}'), 'placeholder should not remain');
  });

  /**
   * Goal: the spec-template path is substituted so the agent reads the right file to learn the
   *   expected level of detail. Pins the second variable.
   * Process: build with a recognizable path; assert it appears and the placeholder does not.
   */
  test('substitutes the specTemplatePath into the template', () => {
    const out = getQuestionPrompt('p', '/tmp/spec-template-X.md');
    assert.ok(out.includes('/tmp/spec-template-X.md'));
    assert.ok(!out.includes('{{specTemplatePath}}'));
  });

  /**
   * Goal: the produced prompt instructs Claude to use the `<question>` XML format. Pins the
   *   contract between the prompt builder and the parser — a change in either side without the
   *   other would break questioning. The parser tests already verify the parser; this verifies
   *   the prompt asks for that format.
   * Process: build any prompt; assert the output mentions `<question>` and the JSON shape.
   */
  test('instructs the agent to use the <question> XML format', () => {
    const out = getQuestionPrompt('p', '/tmp/t.md');
    assert.ok(out.includes('<question>'), 'should mention the open tag');
    assert.ok(out.includes('"text"'), 'should describe the text field');
  });
});

suite('Unit: getQuestionContinuePrompt (subsequent rounds)', () => {
  /**
   * Goal: the formatted Q&A pairs from previous rounds are substituted so the agent has context
   *   for the next round. Pins that user answers reach the agent on the continuation path.
   * Process: build with a recognizable qaPairs string; assert it appears in the output and the
   *   placeholder does not.
   */
  test('substitutes qaPairs into the continuation template', () => {
    const out = getQuestionContinuePrompt('Q: foo\nA: bar', '/tmp/t.md');
    assert.ok(out.includes('Q: foo'));
    assert.ok(out.includes('A: bar'));
    assert.ok(!out.includes('{{qaPairs}}'));
  });

  /**
   * Goal: the spec-template path is substituted on the continuation path too — the agent
   *   re-references the template when asking follow-up questions. Mirrors the initial-round
   *   contract.
   * Process: build with a recognizable path; assert it appears and the placeholder does not.
   */
  test('substitutes the specTemplatePath into the continuation template', () => {
    const out = getQuestionContinuePrompt('q&a', '/tmp/spec-template-Y.md');
    assert.ok(out.includes('/tmp/spec-template-Y.md'));
    assert.ok(!out.includes('{{specTemplatePath}}'));
  });

  /**
   * Goal: the continuation prompt is recognizably distinct from the initial prompt — it should
   *   reference past answers rather than asking the agent to start from scratch. Pins the
   *   intent of "continue" semantics.
   * Process: build both prompts with the same template path and compare; assert they differ.
   */
  test('produces a different prompt body than the initial-round builder', () => {
    const initial = getQuestionPrompt('build a thing', '/tmp/t.md');
    const cont = getQuestionContinuePrompt('Q: x\nA: y', '/tmp/t.md');
    assert.notStrictEqual(initial, cont);
  });
});

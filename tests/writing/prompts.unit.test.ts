/**
 * Unit tests for the writing-phase prompt builders in `core/prompts.ts`.
 *
 * Layer: unit (Mocha). Pure functions; no `vscode` API used.
 * Scope: `wrapTemplatePrompt`, `getRefinementPrompt`, `getSpecRefinePrompt`,
 *   `getTemplatePrompt`. These build the prompts the writing/editor agents see; their
 *   placeholders (`{{userPrompt}}`, `{{toolGuidance}}`) are filled in later by the caller.
 * Out of scope: questioning-phase builders (in `tests/prompt/prompts.unit.test.ts`); the
 *   underlying defaults (values, not behavior).
 */
import * as assert from 'assert';

import {
  getRefinementPrompt,
  getSpecRefinePrompt,
  getTemplatePrompt,
  wrapTemplatePrompt,
} from '../../src/core/prompts';
import type { PromptTemplate } from '../../src/types/promptTemplate';

suite('Unit: wrapTemplatePrompt', () => {
  /**
   * Goal: the wrapper preserves the user's template body verbatim — what the user wrote in
   *   their template appears in the output without rewording. Pins that the wrapper is
   *   additive (preamble + body + postamble), not transformative.
   * Process: wrap a recognizable template body; assert it appears in the output.
   */
  test('preserves the template body in the output', () => {
    const out = wrapTemplatePrompt('PLEASE INCLUDE THESE SECTIONS: A, B, C');
    assert.ok(out.includes('PLEASE INCLUDE THESE SECTIONS: A, B, C'));
  });

  /**
   * Goal: the output is wrapped with the standard preamble + postamble. Pins that callers don't
   *   need to repeat the boilerplate (no-implementation-code rule, write-immediately, etc.).
   *   Verified by content checks rather than literal-string compare so phrasing tweaks don't
   *   break the test.
   * Process: wrap any body; assert the output contains the boilerplate keywords.
   */
  test('adds preamble and postamble around the body', () => {
    const out = wrapTemplatePrompt('Body');
    assert.ok(out.includes('I want to build'), 'preamble references the user goal');
    assert.ok(out.includes('Do NOT'), 'postamble has the do-not block');
    assert.ok(out.includes('Write the spec immediately'), 'closes with the immediate-write directive');
  });

  /**
   * Goal: the wrapper leaves `{{userPrompt}}` and `{{toolGuidance}}` placeholders un-substituted —
   *   the caller is responsible for filling them in via a subsequent `interpolatePrompt`. Pins
   *   that this function is composable with the rest of the prompt pipeline.
   * Process: wrap any body; assert both placeholders appear in the output.
   */
  test('leaves {{userPrompt}} and {{toolGuidance}} placeholders for the caller to fill', () => {
    const out = wrapTemplatePrompt('Body');
    assert.ok(out.includes('{{userPrompt}}'));
    assert.ok(out.includes('{{toolGuidance}}'));
  });

  /**
   * Goal: leading/trailing whitespace in the body is trimmed before insertion so the output
   *   doesn't have stray blank lines around the body.
   * Process: wrap a body padded with newlines and spaces; assert the trimmed body appears
   *   without surrounding blanks.
   */
  test('trims whitespace from the template body', () => {
    const out = wrapTemplatePrompt('\n\n  Trimmed body  \n\n');
    assert.ok(out.includes('Trimmed body'));
    assert.ok(!out.includes('  Trimmed body  '));
  });
});

suite('Unit: getRefinementPrompt', () => {
  /**
   * Goal: substitutes the original prompt and Q&A pairs into the refinement template. Pins
   *   that the refinement agent sees both — without the original it can't refine, without the
   *   Q&A it has nothing to incorporate.
   * Process: build with recognizable inputs; assert both appear in the output.
   */
  test('substitutes originalPrompt and qaPairs into the template', () => {
    const out = getRefinementPrompt('Build a profile API', 'Q: db?\nA: Postgres');
    assert.ok(out.includes('Build a profile API'));
    assert.ok(out.includes('Q: db?'));
    assert.ok(out.includes('A: Postgres'));
  });
});

suite('Unit: getSpecRefinePrompt', () => {
  /**
   * Goal: substitutes Q&A pairs into the spec-refine template. This is the prompt sent to the
   *   editor agent when the user submits answers in the plan-questions panel.
   * Process: build with recognizable Q&A; assert it appears in the output.
   */
  test('substitutes qaPairs into the spec-refine template', () => {
    const out = getSpecRefinePrompt('Q: which db?\nA: Postgres');
    assert.ok(out.includes('Q: which db?'));
    assert.ok(out.includes('A: Postgres'));
  });
});

suite('Unit: getTemplatePrompt', () => {
  /**
   * Goal: a structured template returns the body built from `config` (via `buildPromptFromConfig`),
   *   not the stored `prompt` field. Pins that structured mode is the source of truth for its
   *   own prompt — editing config rebuilds the prompt automatically.
   * Process: build a structured template with a recognizable section; assert the section title
   *   appears in the result.
   */
  test('structured template uses buildPromptFromConfig output', () => {
    const template: PromptTemplate = {
      id: 't',
      name: 'Test',
      filename: 'plan.md',
      mode: 'structured',
      config: {
        sections: [{ id: '1', title: 'Custom Title', description: 'Custom desc' }],
        styles: ['bullet'],
        depth: 'concise',
        notes: '',
      },
      prompt: 'this stored prompt should NOT be used',
    };
    const out = getTemplatePrompt(template);
    assert.ok(out.includes('Custom Title'));
    assert.ok(!out.includes('this stored prompt should NOT be used'));
  });

  /**
   * Goal: a freeform template returns the stored `prompt` field verbatim — no transformation.
   *   Pins that freeform mode bypasses `buildPromptFromConfig` entirely.
   * Process: build a freeform template with a recognizable prompt body; assert the result
   *   equals it.
   */
  test('freeform template returns the stored prompt verbatim', () => {
    const template: PromptTemplate = {
      id: 't',
      name: 'Test',
      filename: 'plan.md',
      mode: 'freeform',
      config: { sections: [], styles: [], depth: 'concise', notes: '' },
      prompt: 'My custom freeform prompt body',
    };
    assert.strictEqual(getTemplatePrompt(template), 'My custom freeform prompt body');
  });
});

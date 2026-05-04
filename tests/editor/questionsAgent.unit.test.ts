/**
 * Unit tests for `computeQuestionsAgent` — derives the questions-tab agent status from the
 * panel state and the editor agent status.
 *
 * Layer: unit (Mocha). Pure function on data.
 * Scope: every priority branch of the function (5 priorities, see source comment). Drives the
 *   exact phase the questions-tab `StreamEndStatus` displays.
 * Out of scope: how the panel state itself is set (covered in `panelQuestionHandlers.unit.test.ts`);
 *   the `agentStatusLabel` formatter (a value, not behavior).
 */
import * as assert from 'assert';

import { computeQuestionsAgent } from '../../src/core/utils/questionsAgent';
import type { AgentStatus, SpecQuestionsPanelState } from '../../src/types/screens';

const ready: AgentStatus = { working: false, phase: 'ready' };
const editing: AgentStatus = { working: true, phase: 'editing_plan' };
const responding: AgentStatus = { working: true, phase: 'responding' };

function panel(overrides: Partial<SpecQuestionsPanelState> = {}): SpecQuestionsPanelState {
  return {
    rounds: [],
    loading: false,
    toolCalls: [],
    collapsed: false,
    willRegenerate: false,
    ...overrides,
  };
}

suite('Unit: computeQuestionsAgent', () => {
  /**
   * Goal: when the panel doesn't exist yet (the plan is still being written), report
   *   `waiting_for_plan` so the questions tab shows a coherent in-progress state. Pins
   *   priority 1 from the source comment.
   * Process: pass `undefined` for panel and any editor status; assert the phase is
   *   `waiting_for_plan`.
   */
  test('reports waiting_for_plan when the panel is undefined', () => {
    const r = computeQuestionsAgent(undefined, ready);
    assert.deepStrictEqual(r, { working: true, phase: 'waiting_for_plan' });
  });

  /**
   * Goal: when the panel is loading (questions actively streaming), report
   *   `generating_questions`. Pins priority 2 — overrides any editor-side state.
   * Process: panel with `loading: true`; assert the phase is `generating_questions`
   *   regardless of editor status.
   */
  test('reports generating_questions when panel.loading is true', () => {
    const r = computeQuestionsAgent(panel({ loading: true }), editing);
    assert.deepStrictEqual(r, { working: true, phase: 'generating_questions' });
  });

  /**
   * Goal: when the editor is editing the plan AND a regenerate is pending, report
   *   `waiting_for_plan_edit` — we need the plan edit to land before resuming questions.
   *   Pins priority 3.
   * Process: panel with `willRegenerate: true`; editor with `phase: 'editing_plan'`; assert
   *   the phase is `waiting_for_plan_edit`.
   */
  test('reports waiting_for_plan_edit when editor is editing AND willRegenerate', () => {
    const r = computeQuestionsAgent(panel({ willRegenerate: true }), editing);
    assert.deepStrictEqual(r, { working: true, phase: 'waiting_for_plan_edit' });
  });

  /**
   * Goal: when a regenerate is pending but the editor is NOT editing the plan (e.g. just
   *   responding to chat), report `generating_questions` — questions will resume soon. Pins
   *   priority 4 — keeps the questions-tab indicator working through the gap.
   * Process: panel with `willRegenerate: true`; editor with `phase: 'responding'`; assert
   *   `generating_questions`.
   */
  test('reports generating_questions when willRegenerate but editor is not editing the plan', () => {
    const r = computeQuestionsAgent(panel({ willRegenerate: true }), responding);
    assert.deepStrictEqual(r, { working: true, phase: 'generating_questions' });
  });

  /**
   * Goal: in the steady state — panel exists, not loading, not regenerating — report `ready`.
   *   Pins priority 5 (the fall-through). The questions tab shows a green dot and "Ready".
   * Process: panel with all flags off; editor ready; assert `ready`.
   */
  test('falls through to ready when nothing else applies', () => {
    const r = computeQuestionsAgent(panel(), ready);
    assert.deepStrictEqual(r, { working: false, phase: 'ready' });
  });

  /**
   * Goal: a chat reply with no pending regenerate (`willRegenerate: false`) leaves the
   *   questions tab as `ready` even while the editor is responding. Pins the documented
   *   distinction: routine chat doesn't interrupt questions, so the tab stays clean.
   * Process: panel with `willRegenerate: false` and editor responding; assert `ready`.
   */
  test('chat reply without pending regenerate leaves questions tab as ready', () => {
    const r = computeQuestionsAgent(panel({ willRegenerate: false }), responding);
    assert.deepStrictEqual(r, { working: false, phase: 'ready' });
  });
});

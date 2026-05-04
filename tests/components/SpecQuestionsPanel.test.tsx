/**
 * Component tests for `SpecQuestionsPanel` — the Questions tab body. Renders unfrozen / frozen
 * rounds, the empty state, the Submit / Refresh buttons, and the trailing status strip.
 *
 * Layer: component (Vitest + RTL + happy-dom).
 * Scope: empty-state visibility rule, Submit / Refresh enable/disable rules, dispatch +
 *   onSubmit callback, frozen-round read-only rendering. Question-input mechanics are covered
 *   by `QuestionItem.test.tsx`; the agent-level handlers are covered by
 *   `editor/panelQuestionHandlers.unit.test.ts`.
 * Out of scope: scroll behavior; tool-call rendering during loading (covered by ToolCallItem
 *   / ToolCallGroup tests).
 */
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AgentStatus, QuestionRound, SpecQuestionsPanelState } from '../../src/types/screens';
import { SpecQuestionsPanel } from '../../src/webview/components/SpecQuestionsPanel';
import { renderComponent } from './helpers/render';

const ready: AgentStatus = { working: false, phase: 'ready' };
const generating: AgentStatus = { working: true, phase: 'generating_questions' };

function makePanel(
  rounds: QuestionRound[] = [],
  overrides: Partial<SpecQuestionsPanelState> = {},
): SpecQuestionsPanelState {
  return {
    rounds,
    loading: false,
    toolCalls: [],
    collapsed: false,
    willRegenerate: false,
    ...overrides,
  };
}

const unanswered = (anchor = 'a'): QuestionRound['questions'][number] => ({
  text: 'Question?',
  anchor,
  textAnswer: '',
  chosenIndices: [],
});
const answered = (anchor = 'a'): QuestionRound['questions'][number] => ({
  text: 'Question?',
  anchor,
  textAnswer: 'yes',
  chosenIndices: [],
});

const submitButton = () =>
  Array.from(document.querySelectorAll('vscode-button')).find((b) => /Submit/.test(b.textContent ?? '')) as
    | HTMLElement
    | undefined;
const refreshButton = () =>
  Array.from(document.querySelectorAll('button')).find((b) => /Refresh questions/.test(b.textContent ?? '')) as
    | HTMLButtonElement
    | undefined;

describe('SpecQuestionsPanel — empty state', () => {
  /**
   * Goal: when the agent is fully idle and there are no questions in any round, the panel shows
   *   the "No questions to answer" empty state. Pins the message that prompts the user to refresh
   *   when no questions have been generated yet.
   * Process: render with `phase: 'ready'` and no rounds; assert the empty-state message appears.
   */
  it('shows the empty state when idle and no questions exist', () => {
    renderComponent(<SpecQuestionsPanel panel={makePanel()} questionsAgent={ready} editorWorking={false} />);
    expect(document.body.textContent).toContain('No questions to answer');
  });

  /**
   * Goal: while the agent is generating, the empty state is hidden — the in-flight state is
   *   shown via the StreamEndStatus dot instead. Pins that "no questions yet" doesn't appear
   *   while the agent is actively producing them.
   * Process: render with no rounds + `generating_questions`; assert the empty-state message is
   *   absent.
   */
  it('hides the empty state while questions are being generated', () => {
    renderComponent(<SpecQuestionsPanel panel={makePanel()} questionsAgent={generating} editorWorking={false} />);
    expect(document.body.textContent).not.toContain('No questions to answer');
  });
});

describe('SpecQuestionsPanel — Submit button', () => {
  /**
   * Goal: Submit is disabled when no question in the active round has an answer. Pins the
   *   gate that prevents submitting an empty round.
   * Process: render with one unanswered question; assert disabled.
   */
  it('is disabled when no questions are answered', () => {
    renderComponent(
      <SpecQuestionsPanel
        panel={makePanel([{ questions: [unanswered()], frozen: false }])}
        questionsAgent={ready}
        editorWorking={false}
      />,
    );
    expect(submitButton()?.hasAttribute('disabled')).toBe(true);
  });

  /**
   * Goal: Submit is enabled when at least one question in the non-frozen round has an answer.
   *   Pins the inverse case.
   * Process: render with one answered question; assert enabled.
   */
  it('is enabled when at least one answer exists in the active round', () => {
    renderComponent(
      <SpecQuestionsPanel
        panel={makePanel([{ questions: [answered()], frozen: false }])}
        questionsAgent={ready}
        editorWorking={false}
      />,
    );
    expect(submitButton()?.hasAttribute('disabled')).toBe(false);
  });

  /**
   * Goal: Submit is disabled while the editor agent is working — submitting would race ongoing
   *   plan edits. Pins the editor-working gate.
   * Process: render with answered + `editorWorking: true`; assert disabled.
   */
  it('is disabled while the editor agent is working', () => {
    renderComponent(
      <SpecQuestionsPanel
        panel={makePanel([{ questions: [answered()], frozen: false }])}
        questionsAgent={ready}
        editorWorking={true}
      />,
    );
    expect(submitButton()?.hasAttribute('disabled')).toBe(true);
  });

  /**
   * Goal: clicking Submit dispatches `submitPanelAnswers` AND calls the `onSubmit` callback.
   *   Pins the only path from this button — the callback is what flips the active tab to chat.
   * Process: render enabled with onSubmit spy; click; assert both effects.
   */
  it('clicking Submit dispatches submitPanelAnswers and calls onSubmit', () => {
    const onSubmit = vi.fn();
    const { postMessage } = renderComponent(
      <SpecQuestionsPanel
        panel={makePanel([{ questions: [answered()], frozen: false }])}
        questionsAgent={ready}
        editorWorking={false}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(submitButton()!);
    expect(postMessage).toHaveBeenCalledWith({ type: 'submitPanelAnswers' });
    expect(onSubmit).toHaveBeenCalled();
  });
});

describe('SpecQuestionsPanel — Refresh button', () => {
  /**
   * Goal: Refresh is disabled when the questions agent isn't fully idle (e.g. generating). Pins
   *   the rule that prevents stacking refresh requests on top of an in-flight generation.
   * Process: render with `generating_questions`; assert disabled.
   */
  it('is disabled while questions are generating', () => {
    renderComponent(<SpecQuestionsPanel panel={makePanel()} questionsAgent={generating} editorWorking={false} />);
    expect(refreshButton()?.disabled).toBe(true);
  });

  /**
   * Goal: Refresh is disabled while the editor agent is working — refresh would compete for the
   *   spec content.
   * Process: render with idle questions + `editorWorking: true`; assert disabled.
   */
  it('is disabled while the editor agent is working', () => {
    renderComponent(<SpecQuestionsPanel panel={makePanel()} questionsAgent={ready} editorWorking={true} />);
    expect(refreshButton()?.disabled).toBe(true);
  });

  /**
   * Goal: clicking Refresh dispatches `refreshPanelQuestions`. Pins the only side effect of the
   *   button.
   * Process: render with everything idle; click; assert dispatch.
   */
  it('clicking Refresh dispatches refreshPanelQuestions', () => {
    const { postMessage } = renderComponent(
      <SpecQuestionsPanel panel={makePanel()} questionsAgent={ready} editorWorking={false} />,
    );
    fireEvent.click(refreshButton()!);
    expect(postMessage).toHaveBeenCalledWith({ type: 'refreshPanelQuestions' });
  });
});

describe('SpecQuestionsPanel — frozen rounds', () => {
  /**
   * Goal: frozen rounds render the question and its formatted answer (read-only). Pins that
   *   historical rounds remain visible alongside the active round as a record of what was asked
   *   and answered.
   * Process: render with one frozen round whose question has a textAnswer; assert both the
   *   question text and the answer text appear.
   */
  it('renders frozen-round questions with their answers visible', () => {
    const frozenRound: QuestionRound = {
      questions: [{ text: 'What auth?', anchor: 'a', textAnswer: 'OAuth', chosenIndices: [] }],
      frozen: true,
    };
    renderComponent(
      <SpecQuestionsPanel
        panel={makePanel([frozenRound, { questions: [unanswered('b')], frozen: false }])}
        questionsAgent={ready}
        editorWorking={false}
      />,
    );
    expect(document.body.textContent).toContain('What auth?');
    expect(document.body.textContent).toContain('OAuth');
  });

  /**
   * Goal: an answer in a frozen round does NOT enable Submit — only the active (non-frozen)
   *   round drives the gate. Pins the "active round only" rule used by the editor handler.
   * Process: render with a frozen-answered round AND a non-frozen-unanswered round; assert
   *   Submit is still disabled.
   */
  it('does not count frozen-round answers toward Submit enable', () => {
    renderComponent(
      <SpecQuestionsPanel
        panel={makePanel([
          { questions: [answered('frozen-q')], frozen: true },
          { questions: [unanswered('active-q')], frozen: false },
        ])}
        questionsAgent={ready}
        editorWorking={false}
      />,
    );
    expect(submitButton()?.hasAttribute('disabled')).toBe(true);
  });
});

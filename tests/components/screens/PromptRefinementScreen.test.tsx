/**
 * Component tests for `PromptRefinementScreen` — the screen that appears after the user submits
 * a prompt, where the questioning agent streams clarifying questions and the user can either
 * "Keep planning" (refine + ask more) or "Generate plan" (move on to writing).
 *
 * Layer: component (Vitest + RTL + happy-dom). Renders the React component in isolation.
 * Scope: button enable/disable logic for both action buttons (which depends on a 4-axis state
 *   space — questionsLoading × refining × hasAnswers × isFirstRound), and message dispatch
 *   on click.
 * Out of scope: the questioning stream itself (covered by tests for `QuestioningStream` and
 *   `xmlQuestionParser` when added); the back-end transitions to `WritingSpecState` /
 *   `GeneratingPromptQuestionsState` (covered by `tests/prompt/promptQuestions.unit.test.ts`).
 */
import { fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { PromptQuestion } from '../../../src/types/promptQuestion';
import type { AppScreen } from '../../../src/types/screens';
import { PromptRefinementScreen } from '../../../src/webview/screens/PromptRefinementScreen';
import { renderComponent } from '../helpers/render';

type PromptRefinementScreenData = Extract<AppScreen, { type: 'promptRefinement' }>;

const unanswered: PromptQuestion = { id: 1, text: 'What DB?', textAnswer: '', chosenIndices: [] };
const answered: PromptQuestion = { id: 2, text: 'What auth?', textAnswer: 'OAuth', chosenIndices: [] };

function makeScreen(overrides: Partial<PromptRefinementScreenData> = {}): PromptRefinementScreenData {
  return {
    type: 'promptRefinement',
    questions: [],
    currentPrompt: 'Build a profile API',
    questionsLoading: false,
    refining: false,
    agentStatus: { working: false, phase: 'ready' },
    questioningMessages: [],
    isFirstRound: false,
    roundStartIndex: 0,
    ...overrides,
  };
}

const buttons = () => Array.from(document.querySelectorAll('vscode-button')) as HTMLElement[];
const findButton = (label: RegExp): HTMLElement | undefined => buttons().find((b) => label.test(b.textContent ?? ''));

describe('PromptRefinementScreen — Keep planning button', () => {
  /**
   * Goal: "Keep planning" requires at least one answered question to be enabled. Without an
   *   answer, refining the prompt has nothing to incorporate. Pins the gate that prevents
   *   no-op refinement rounds.
   * Process: render with questions but none answered; assert the button is disabled.
   */
  it('is disabled when no questions are answered', () => {
    renderComponent(<PromptRefinementScreen screen={makeScreen({ questions: [unanswered] })} />);
    expect(findButton(/keep planning/i)?.hasAttribute('disabled')).toBe(true);
  });

  /**
   * Goal: with at least one answered question, the button becomes available. Pins the inverse
   *   of the disabled-no-answers case.
   * Process: render with one answered question; assert the button is enabled.
   */
  it('is enabled when at least one question has an answer', () => {
    renderComponent(<PromptRefinementScreen screen={makeScreen({ questions: [answered, unanswered] })} />);
    expect(findButton(/keep planning/i)?.hasAttribute('disabled')).toBe(false);
  });

  /**
   * Goal: while questions are streaming, "Keep planning" is disabled even with answers — clicking
   *   it mid-stream would be a race against the in-flight round. Pins the loading-state guard.
   * Process: render with answers and `questionsLoading: true`; assert disabled.
   */
  it('is disabled while questions are loading (questionsLoading=true)', () => {
    renderComponent(<PromptRefinementScreen screen={makeScreen({ questions: [answered], questionsLoading: true })} />);
    expect(findButton(/keep planning/i)?.hasAttribute('disabled')).toBe(true);
  });

  /**
   * Goal: while a previous "Keep planning" click is still being processed (`refining: true`),
   *   the button stays disabled to prevent a double-click triggering two refinement rounds.
   * Process: render with answers and `refining: true`; assert disabled.
   */
  it('is disabled while refining is in progress', () => {
    renderComponent(<PromptRefinementScreen screen={makeScreen({ questions: [answered], refining: true })} />);
    expect(findButton(/keep planning/i)?.hasAttribute('disabled')).toBe(true);
  });

  /**
   * Goal: clicking "Keep planning" when enabled posts `refinePrompt` — the only way to trigger
   *   a refinement round from the UI.
   * Process: render with an answered question; click; assert `refinePrompt` was dispatched.
   */
  it('clicking Keep planning posts refinePrompt', () => {
    const { postMessage } = renderComponent(<PromptRefinementScreen screen={makeScreen({ questions: [answered] })} />);
    fireEvent.click(findButton(/keep planning/i)!);
    expect(postMessage).toHaveBeenCalledWith({ type: 'refinePrompt' });
  });
});

describe('PromptRefinementScreen — Generate plan button', () => {
  /**
   * Goal: during the first round of questioning (still loading), "Generate plan" is disabled —
   *   users shouldn't be able to skip the whole questioning phase before any questions even
   *   appear. Pins the first-round-streaming guard.
   * Process: render with `isFirstRound: true, questionsLoading: true`; assert disabled.
   */
  it('is disabled during first-round streaming', () => {
    renderComponent(<PromptRefinementScreen screen={makeScreen({ isFirstRound: true, questionsLoading: true })} />);
    expect(findButton(/generate plan/i)?.hasAttribute('disabled')).toBe(true);
  });

  /**
   * Goal: in subsequent rounds the button stays enabled even while questions stream — the user
   *   has already seen at least one round and can decide to bail out at any time. Pins the
   *   "honored mid-stream" contract from the docs.
   * Process: render with `isFirstRound: false, questionsLoading: true`; assert enabled.
   */
  it('is enabled mid-stream in subsequent rounds (questionsLoading + !isFirstRound)', () => {
    renderComponent(<PromptRefinementScreen screen={makeScreen({ isFirstRound: false, questionsLoading: true })} />);
    expect(findButton(/generate plan/i)?.hasAttribute('disabled')).toBe(false);
  });

  /**
   * Goal: when the screen is idle, the button is enabled regardless of whether any answers
   *   exist — the user can always proceed to plan generation with whatever prompt they have.
   * Process: render in the idle state with no answers; assert enabled.
   */
  it('is enabled when idle even with no answers', () => {
    renderComponent(<PromptRefinementScreen screen={makeScreen({ questions: [unanswered] })} />);
    expect(findButton(/generate plan/i)?.hasAttribute('disabled')).toBe(false);
  });

  /**
   * Goal: clicking "Generate plan" posts `generateSpec` — the only path from questioning to
   *   plan generation.
   * Process: render in idle state; click; assert `generateSpec` was dispatched.
   */
  it('clicking Generate plan posts generateSpec', () => {
    const { postMessage } = renderComponent(<PromptRefinementScreen screen={makeScreen()} />);
    fireEvent.click(findButton(/generate plan/i)!);
    expect(postMessage).toHaveBeenCalledWith({ type: 'generateSpec' });
  });
});

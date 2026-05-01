/**
 * Component tests for `SpecEditingScreen` — the three-tab editing surface (Chat / Questions /
 * Feedback) that the user lives in once a plan exists.
 *
 * Layer: component (Vitest + RTL + happy-dom).
 * Scope: tab switching (active highlight), badge rules on the Questions and Feedback tabs,
 *   pulsing-dot replacement during question generation, ResumeButton conditional rendering and
 *   click-to-copy behavior, and the default-tab landing on first mount. Subcomponent contents
 *   (ActivityStream / SpecQuestionsPanel / FeedbackTab / ChatInput) are covered by their own
 *   tests; this file only verifies wiring + screen-level layout decisions.
 * Out of scope: persistence across separate renders (the webview-state stub from setup.ts is
 *   non-persistent — that path is covered by manual QA + `usePersistentState` itself); the
 *   backend transitions triggered by tab actions (covered in editor unit tests).
 */
import { fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppScreen } from '../../../src/types/screens';
import { SpecEditingScreen } from '../../../src/webview/screens/SpecEditingScreen';
import { renderComponent } from '../helpers/render';

type SpecEditingScreenData = Extract<AppScreen, { type: 'specEditing' }>;

function makeScreen(overrides: Partial<SpecEditingScreenData> = {}): SpecEditingScreenData {
  return {
    type: 'specEditing',
    specFilePath: '/tmp/spec.md',
    prompt: 'Build a profile API',
    streamItems: [],
    messageDraft: '',
    feedbackItems: [],
    nFeedback: 0,
    editorAgent: { working: false, phase: 'ready' },
    questionsAgent: { working: false, phase: 'ready' },
    questionsPanel: undefined,
    sessionId: undefined,
    freshEntry: true,
    ...overrides,
  };
}

// Tabs are rendered as plain divs containing a span with the title; pull them out by text.
function findTab(title: 'Chat' | 'Questions' | 'Feedback'): HTMLElement | undefined {
  const spans = Array.from(document.querySelectorAll('span')) as HTMLElement[];
  const span = spans.find((s) => s.textContent === title);
  return span?.parentElement as HTMLElement | undefined;
}

function isActive(tab: HTMLElement | undefined): boolean {
  // Active tabs have a focusBorder underline; inactive use 'transparent'.
  return (tab?.getAttribute('style') ?? '').includes('focusBorder');
}

describe('SpecEditingScreen — tab switching', () => {
  /**
   * Goal: on a fresh entry from another screen, the Chat tab is active by default. Pins the
   *   "land on chat after plan generation" UX so the user immediately sees the agent's last
   *   activity rather than the (empty) questions panel.
   * Process: render with `freshEntry: true`; assert the Chat tab is active and the others are not.
   */
  it('lands on the Chat tab on fresh entry', () => {
    renderComponent(<SpecEditingScreen screen={makeScreen()} />);
    expect(isActive(findTab('Chat'))).toBe(true);
    expect(isActive(findTab('Questions'))).toBe(false);
    expect(isActive(findTab('Feedback'))).toBe(false);
  });

  /**
   * Goal: clicking a tab activates it and deactivates the previously-active one. Pins the basic
   *   tab interaction.
   * Process: render; click Questions tab; assert Questions is active, Chat is not.
   */
  it('clicking a tab activates it', () => {
    renderComponent(<SpecEditingScreen screen={makeScreen()} />);
    fireEvent.click(findTab('Questions')!);
    expect(isActive(findTab('Questions'))).toBe(true);
    expect(isActive(findTab('Chat'))).toBe(false);
  });
});

describe('SpecEditingScreen — Questions tab badge', () => {
  /**
   * Goal: when the questions panel has unanswered questions in non-frozen rounds, the Questions
   *   tab shows the active count as a badge. Pins the at-a-glance signal that there is work to
   *   do on a tab the user isn't currently viewing.
   * Process: render with a panel containing 2 questions in a non-frozen round; assert the badge
   *   text "2" appears in the Questions tab.
   */
  it('shows the active question count as a badge', () => {
    const screen = makeScreen({
      questionsPanel: {
        rounds: [
          {
            questions: [
              { text: 'Q1', anchor: 'a1', textAnswer: '', chosenIndices: [] },
              { text: 'Q2', anchor: 'a2', textAnswer: '', chosenIndices: [] },
            ],
            frozen: false,
          },
        ],
        loading: false,
        toolCalls: [],
        collapsed: false,
        willRegenerate: false,
      },
    });
    renderComponent(<SpecEditingScreen screen={screen} />);
    const tab = findTab('Questions');
    expect(tab?.textContent).toContain('2');
  });

  /**
   * Goal: questions in frozen rounds are NOT counted in the badge — frozen rounds are historical,
   *   not pending work. Pins the count-only-non-frozen rule.
   * Process: render with both a frozen and a non-frozen round; assert the badge counts only the
   *   non-frozen round's questions.
   */
  it('does not count frozen rounds toward the badge', () => {
    const screen = makeScreen({
      questionsPanel: {
        rounds: [
          {
            questions: [{ text: 'Old', anchor: 'old', textAnswer: 'a', chosenIndices: [] }],
            frozen: true,
          },
          {
            questions: [{ text: 'New', anchor: 'new', textAnswer: '', chosenIndices: [] }],
            frozen: false,
          },
        ],
        loading: false,
        toolCalls: [],
        collapsed: false,
        willRegenerate: false,
      },
    });
    renderComponent(<SpecEditingScreen screen={screen} />);
    const tab = findTab('Questions');
    expect(tab?.textContent).toContain('1');
    expect(tab?.textContent).not.toContain('2');
  });

  /**
   * Goal: when the questions agent is in `generating_questions`, the Questions tab shows a
   *   pulsing dot instead of any badge — even if a non-zero count would otherwise display. Pins
   *   the priority of "in flight" over "count" so the user sees fresh activity immediately.
   * Process: render with a non-frozen round AND `generating_questions`; assert no numeric badge
   *   in the Questions tab.
   */
  it('shows a pulsing dot (no badge) while questions are generating', () => {
    const screen = makeScreen({
      questionsAgent: { working: true, phase: 'generating_questions' },
      questionsPanel: {
        rounds: [
          {
            questions: [{ text: 'Q', anchor: 'a', textAnswer: '', chosenIndices: [] }],
            frozen: false,
          },
        ],
        loading: false,
        toolCalls: [],
        collapsed: false,
        willRegenerate: false,
      },
    });
    renderComponent(<SpecEditingScreen screen={screen} />);
    // The badge span text is "1"; the pulsing dot has no text. Assert the tab text after the
    // title is empty (no number appears).
    const tab = findTab('Questions');
    const trailing = tab?.textContent?.replace('Questions', '').trim() ?? '';
    expect(trailing).toBe('');
  });
});

describe('SpecEditingScreen — Feedback tab badge', () => {
  /**
   * Goal: when `nFeedback > 0`, the Feedback tab shows the count as a badge. Pins the
   *   pending-feedback signal — important when the user is on another tab and has unsubmitted
   *   feedback waiting.
   * Process: render with `nFeedback: 3`; assert "3" appears in the Feedback tab.
   */
  it('shows the pending feedback count as a badge', () => {
    renderComponent(<SpecEditingScreen screen={makeScreen({ nFeedback: 3 })} />);
    const tab = findTab('Feedback');
    expect(tab?.textContent).toContain('3');
  });

  /**
   * Goal: when there is no pending feedback, no badge is shown. Pins that the badge is
   *   conditional, not always visible (so the user doesn't see a "0" cluttering the tab).
   * Process: render with `nFeedback: 0`; assert no number in the Feedback tab.
   */
  it('hides the badge when nFeedback is 0', () => {
    renderComponent(<SpecEditingScreen screen={makeScreen({ nFeedback: 0 })} />);
    const tab = findTab('Feedback');
    const trailing = tab?.textContent?.replace('Feedback', '').trim() ?? '';
    expect(trailing).toBe('');
  });
});

describe('SpecEditingScreen — Resume button', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
  });

  /**
   * Goal: when the screen carries a sessionId, the "Copy resume command" button is rendered.
   *   Pins the visibility rule — without a sessionId there's nothing to resume.
   * Process: render with a sessionId; assert a button with the resume label appears.
   */
  it('renders the Copy resume command button when sessionId is present', () => {
    renderComponent(<SpecEditingScreen screen={makeScreen({ sessionId: 'abc-123' })} />);
    expect(document.body.textContent).toContain('Copy resume command');
  });

  /**
   * Goal: when there is no sessionId, the button is not rendered (the agent never produced one
   *   yet). Pins the negative case.
   * Process: render without sessionId; assert no resume label.
   */
  it('hides the Copy resume command button when sessionId is missing', () => {
    renderComponent(<SpecEditingScreen screen={makeScreen()} />);
    expect(document.body.textContent).not.toContain('Copy resume command');
  });

  /**
   * Goal: clicking the resume button writes `claude --resume <sessionId>` to the clipboard and
   *   the button label flips to "Copied!". Pins the only behavior of the button.
   * Process: render with a sessionId; click; assert clipboard.writeText was called with the
   *   expected command and the label updates.
   */
  it('clicking the resume button copies the resume command', () => {
    renderComponent(<SpecEditingScreen screen={makeScreen({ sessionId: 'abc-123' })} />);
    const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
    const resumeBtn = buttons.find((b) => /Copy resume command/.test(b.textContent ?? ''));
    fireEvent.click(resumeBtn!);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('claude --resume abc-123');
    expect(document.body.textContent).toContain('Copied!');
  });
});

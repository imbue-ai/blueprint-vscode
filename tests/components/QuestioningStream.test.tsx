/**
 * Component tests for `QuestioningStream` — renders the interleaved text / tool-call / question
 * stream during the prompt-questioning phase.
 *
 * Layer: component (Vitest + RTL + happy-dom).
 * Scope: each message-type rendering path (text, tool_call, question) and the round-hint
 *   gating (visible only when idle + active questions exist). The component delegates to
 *   QuestioningMessageItem / ToolCallItem / ToolCallGroup / RoundHintCard — these tests verify
 *   the content reaches the DOM, not the deep rendering details of each child.
 * Out of scope: scroll-into-view + spacer-sizing behavior (require layout that happy-dom
 *   doesn't compute reliably); ResizeObserver-driven recalculation.
 */
import { describe, expect, it } from 'vitest';

import type { PromptQuestion } from '../../src/types/promptQuestion';
import type { QuestioningMessage } from '../../src/types/questioningMessage';
import { QuestioningStream } from '../../src/webview/components/QuestioningStream';
import { renderComponent } from './helpers/render';

const q = (overrides: Partial<PromptQuestion> = {}): PromptQuestion => ({
  id: 1,
  text: 'What database?',
  textAnswer: '',
  chosenIndices: [],
  ...overrides,
});

describe('QuestioningStream — message rendering', () => {
  /**
   * Goal: empty messages list renders without crashing (no children, just the wrapper). Pins the
   *   no-content base case the user sees on first arrival before any agent output streams.
   * Process: render with `messages: []`; assert the component mounted (no thrown error).
   */
  it('renders empty messages without crashing', () => {
    renderComponent(<QuestioningStream messages={[]} streaming={true} roundStartIndex={0} />);
    expect(document.body.firstElementChild).not.toBeNull();
  });

  /**
   * Goal: a `text` message's content appears in the DOM. Pins the prose-rendering path —
   *   explanatory text from the agent should be readable.
   * Process: render with one text message; assert the content string appears in document.body.
   */
  it('renders text messages', () => {
    const messages: QuestioningMessage[] = [{ type: 'text', content: 'Looking at the codebase…' }];
    renderComponent(<QuestioningStream messages={messages} streaming={true} roundStartIndex={0} />);
    expect(document.body.textContent).toContain('Looking at the codebase…');
  });

  /**
   * Goal: a `tool_call` message renders the tool name. Pins the tool-call rendering path so
   *   users see what the agent is doing during exploration.
   * Process: render with one tool call (name='Read'); assert 'Read' appears in the DOM.
   */
  it('renders tool_call messages with the tool name', () => {
    const messages: QuestioningMessage[] = [{ type: 'tool_call', name: 'Read', summary: 'src/foo.ts', args: {} }];
    renderComponent(<QuestioningStream messages={messages} streaming={true} roundStartIndex={0} />);
    expect(document.body.textContent).toContain('Read');
    expect(document.body.textContent).toContain('src/foo.ts');
  });

  /**
   * Goal: a `question` message renders the question text. Pins the question-rendering path —
   *   without this, parsed questions wouldn't reach the user.
   * Process: render with one question message; assert the question text appears in the DOM.
   */
  it('renders question messages with the question text', () => {
    const messages: QuestioningMessage[] = [
      { type: 'question', question: q({ text: 'What database do you want?' }), frozen: false },
    ];
    renderComponent(<QuestioningStream messages={messages} streaming={false} roundStartIndex={0} />);
    expect(document.body.textContent).toContain('What database do you want?');
  });

  /**
   * Goal: multiple consecutive tool calls are rendered as a group (single tool calls are
   *   inlined). The grouping logic lives in `groupQuestioningMessages` — pinning that the
   *   stream actually invokes it. Verified by content rather than structure: all tool names
   *   should still appear regardless of grouping mode.
   * Process: render two consecutive tool calls; assert both names appear.
   */
  it('renders consecutive tool calls (grouping or not, content reaches the DOM)', () => {
    const messages: QuestioningMessage[] = [
      { type: 'tool_call', name: 'Read', summary: 'a.ts', args: {} },
      { type: 'tool_call', name: 'Glob', summary: 'src/**', args: {} },
    ];
    renderComponent(<QuestioningStream messages={messages} streaming={true} roundStartIndex={0} />);
    expect(document.body.textContent).toContain('Read');
    expect(document.body.textContent).toContain('Glob');
  });
});

describe('QuestioningStream — round hint card', () => {
  /**
   * Goal: when streaming has stopped AND at least one active (non-frozen) question exists, the
   *   round-hint card appears prompting the user to choose "Keep planning" or "Generate plan".
   *   Pins the contextual help that surfaces only when the user can act.
   * Process: render with one active question and `streaming: false`; assert the hint text
   *   appears.
   */
  it('shows the round hint when idle with an active question', () => {
    const messages: QuestioningMessage[] = [{ type: 'question', question: q(), frozen: false }];
    renderComponent(<QuestioningStream messages={messages} streaming={false} roundStartIndex={0} />);
    expect(document.body.textContent).toContain('Click');
    expect(document.body.textContent).toContain('Keep planning');
  });

  /**
   * Goal: while streaming is in progress, the round-hint card is suppressed — the user shouldn't
   *   be told to act mid-stream. Pins the visibility gate.
   * Process: render with an active question and `streaming: true`; assert the hint text is
   *   absent.
   */
  it('hides the round hint while streaming', () => {
    const messages: QuestioningMessage[] = [{ type: 'question', question: q(), frozen: false }];
    renderComponent(<QuestioningStream messages={messages} streaming={true} roundStartIndex={0} />);
    expect(document.body.textContent).not.toContain('Each round of');
  });

  /**
   * Goal: when all questions are frozen (past rounds only), the round-hint is also suppressed —
   *   there's no active round for the user to act on. Pins the active-questions check that
   *   distinguishes from "any question exists".
   * Process: render with one frozen question and `streaming: false`; assert the hint is absent.
   */
  it('hides the round hint when only frozen questions exist', () => {
    const messages: QuestioningMessage[] = [{ type: 'question', question: q(), frozen: true }];
    renderComponent(<QuestioningStream messages={messages} streaming={false} roundStartIndex={0} />);
    expect(document.body.textContent).not.toContain('Each round of');
  });
});

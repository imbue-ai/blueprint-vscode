/**
 * Component tests for `ActivityStream` — the chat-tab transcript that renders prompt + messages
 * + grouped tool calls and (optionally) the trailing StreamEndStatus.
 *
 * Layer: component (Vitest + RTL + happy-dom).
 * Scope: prompt bubble conditional render, user/assistant message labels + content, consecutive
 *   tool-call grouping, StreamEndStatus presence/absence based on `agentStatus`. Auto-scroll
 *   and spacer sizing are skipped — they depend on real layout (`clientHeight`, ResizeObserver)
 *   that happy-dom doesn't simulate meaningfully.
 * Out of scope: `ToolCallItem`/`ToolCallGroup` internals (separate components); `StreamEndStatus`
 *   visuals (own test); markdown rendering details (delegated to `react-markdown`).
 */
import { describe, expect, it } from 'vitest';

import type { StreamItem } from '../../src/types/screens';
import { ActivityStream } from '../../src/webview/components/ActivityStream';
import { renderComponent } from './helpers/render';

const userMsg = (content: string): StreamItem => ({ type: 'user_message', content });
const asstMsg = (content: string): StreamItem => ({ type: 'assistant_message', content });
const toolCall = (name: string, summary: string): StreamItem => ({
  type: 'tool_call',
  name,
  summary,
  args: {},
});

describe('ActivityStream — prompt bubble', () => {
  /**
   * Goal: when a `prompt` prop is provided, it is rendered at the top so the user sees the
   *   originating request alongside the agent's responses. Pins the prompt-context surface.
   * Process: render with a recognizable prompt; assert it appears in the DOM.
   */
  it('renders the prompt when provided', () => {
    renderComponent(<ActivityStream items={[]} prompt="Build a profile API" />);
    expect(document.body.textContent).toContain('Build a profile API');
  });

  /**
   * Goal: when no prompt is provided, no prompt bubble is rendered (no stray "undefined" or
   *   empty-bubble chrome). Pins the conditional render.
   * Process: render without a prompt; assert the placeholder string from the bubble is absent
   *   by checking nothing leaks. Use a minimal items list.
   */
  it('omits the prompt bubble when prompt is undefined', () => {
    renderComponent(<ActivityStream items={[asstMsg('Hello')]} />);
    expect(document.body.textContent).not.toContain('undefined');
    expect(document.body.textContent).toContain('Hello');
  });
});

describe('ActivityStream — messages', () => {
  /**
   * Goal: user_message items render with the "You" label and the content. Pins the role
   *   labeling that lets the user distinguish their own turns from the agent's.
   * Process: render with one user message; assert the label and content both appear.
   */
  it('renders user messages with the "You" label', () => {
    renderComponent(<ActivityStream items={[userMsg('what is auth?')]} />);
    expect(document.body.textContent).toContain('You');
    expect(document.body.textContent).toContain('what is auth?');
  });

  /**
   * Goal: assistant_message items render with the "Assistant" label and the content. Pins the
   *   inverse label.
   * Process: render with one assistant message; assert label and content both appear.
   */
  it('renders assistant messages with the "Assistant" label', () => {
    renderComponent(<ActivityStream items={[asstMsg('OAuth is one option.')]} />);
    expect(document.body.textContent).toContain('Assistant');
    expect(document.body.textContent).toContain('OAuth is one option.');
  });

  /**
   * Goal: items render in source order. Pins the chronological invariant — without it, a user's
   *   question could appear after the answer.
   * Process: render two messages; assert the user message text appears before the assistant
   *   message text in the DOM string.
   */
  it('renders items in source order', () => {
    renderComponent(<ActivityStream items={[userMsg('Q1'), asstMsg('A1')]} />);
    const text = document.body.textContent ?? '';
    expect(text.indexOf('Q1')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('Q1')).toBeLessThan(text.indexOf('A1'));
  });
});

describe('ActivityStream — tool call grouping', () => {
  /**
   * Goal: consecutive tool_call items render their summaries (each tool call is visible).
   *   Pins that the grouping doesn't drop or hide tool calls.
   * Process: render two consecutive tool calls; assert both summaries appear.
   */
  it('renders summaries for consecutive tool calls', () => {
    renderComponent(
      <ActivityStream items={[toolCall('Read', 'Reading spec.md'), toolCall('Edit', 'Editing line 5')]} />,
    );
    expect(document.body.textContent).toContain('Reading spec.md');
    expect(document.body.textContent).toContain('Editing line 5');
  });

  /**
   * Goal: messages interleaved with tool calls all render. Pins that the group boundary doesn't
   *   swallow surrounding messages — a tool call after a user message and before an assistant
   *   message should leave both messages intact.
   * Process: render user → tool_call → assistant; assert all three pieces of text appear.
   */
  it('keeps interleaved messages around tool-call groups', () => {
    renderComponent(
      <ActivityStream items={[userMsg('refactor this'), toolCall('Edit', 'Editing line 5'), asstMsg('done')]} />,
    );
    const text = document.body.textContent ?? '';
    expect(text).toContain('refactor this');
    expect(text).toContain('Editing line 5');
    expect(text).toContain('done');
  });
});

describe('ActivityStream — end status', () => {
  /**
   * Goal: when `agentStatus` is provided, the StreamEndStatus strip renders with the mapped
   *   label. Pins the wiring through `agentStatusLabel`.
   * Process: render with `editing_plan`; assert the label "Editing plan" appears.
   */
  it('renders the end-status strip with the mapped label', () => {
    renderComponent(<ActivityStream items={[]} agentStatus={{ working: true, phase: 'editing_plan' }} />);
    expect(document.body.textContent).toContain('Editing plan');
  });

  /**
   * Goal: when `agentStatus` is omitted, the strip is not rendered (this happens in screens that
   *   don't track agent activity, e.g. read-only contexts). Pins the conditional.
   * Process: render without `agentStatus`; assert no idle/working label appears in body.
   */
  it('omits the end-status strip when agentStatus is undefined', () => {
    renderComponent(<ActivityStream items={[]} />);
    expect(document.body.textContent).not.toContain('Ready');
    expect(document.body.textContent).not.toContain('Editing plan');
  });
});

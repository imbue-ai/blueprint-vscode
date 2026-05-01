/**
 * Component tests for `StreamEndStatus` — the small "status dot + label" strip rendered at the
 * bottom of the chat tab to indicate whether an agent is currently working.
 *
 * Layer: component (Vitest + RTL + happy-dom).
 * Scope: label rendering, working vs idle visual differentiation (the only meaningful axis the
 *   parent controls). Color values are inline styles; we assert their presence by substring so
 *   the test survives palette tweaks.
 * Out of scope: agent-status label mapping (covered by `agentStatusLabel` consumers); the
 *   ActivityStream wrapper that decides when to render this (covered separately).
 */
import { describe, expect, it } from 'vitest';

import { StreamEndStatus } from '../../src/webview/components/StreamEndStatus';
import { renderComponent } from './helpers/render';

describe('StreamEndStatus', () => {
  /**
   * Goal: the provided `text` prop is rendered as the visible label. Pins the only data the
   *   component renders.
   * Process: render with a recognizable label; assert it appears in the DOM.
   */
  it('renders the label text', () => {
    renderComponent(<StreamEndStatus working={false} text="Ready" />);
    expect(document.body.textContent).toContain('Ready');
  });

  /**
   * Goal: while working, the dot pulses (animation: pulse) so the user sees in-flight activity
   *   even when the label hasn't changed. Pins the visual differentiation between working and
   *   idle.
   * Process: render with `working: true`; locate the dot div; assert its inline style includes
   *   the pulse animation.
   */
  it('animates the dot while working', () => {
    const { container } = renderComponent(<StreamEndStatus working={true} text="Editing plan" />);
    // The dot is the first inner div; identify it by the inline border-radius: 50% rule.
    const dot = Array.from(container.querySelectorAll('div')).find((el) =>
      (el.getAttribute('style') ?? '').includes('border-radius: 50%'),
    );
    expect(dot?.getAttribute('style') ?? '').toContain('pulse');
  });

  /**
   * Goal: idle (working=false) renders the dot without the pulse animation. Pins the inverse
   *   visual case.
   * Process: render with `working: false`; assert no pulse animation in the dot's style.
   */
  it('does not animate the dot when idle', () => {
    const { container } = renderComponent(<StreamEndStatus working={false} text="Ready" />);
    // The dot is the first inner div; identify it by the inline border-radius: 50% rule.
    const dot = Array.from(container.querySelectorAll('div')).find((el) =>
      (el.getAttribute('style') ?? '').includes('border-radius: 50%'),
    );
    expect(dot?.getAttribute('style') ?? '').not.toContain('pulse');
  });
});

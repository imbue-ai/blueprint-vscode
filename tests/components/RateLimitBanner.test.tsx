/**
 * Component tests for `RateLimitBanner` — the modal-style overlay shown when a Claude session
 * hits the rate limit, with a countdown until the limit resets and a Dismiss button.
 *
 * Layer: component (Vitest + RTL + happy-dom).
 * Scope: countdown formatting (now / minutes / hours+minutes / hours-only), Dismiss button
 *   click → onDismiss callback. Auto-refresh via the 30s interval is not asserted (timing in
 *   happy-dom is brittle and the formatting tests already pin the format).
 * Out of scope: when the banner is mounted (App-level concern, covered by the App's overall
 *   shape and the `onRateLimit` flow which is exercised in workflow tests).
 */
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RateLimitBanner } from '../../src/webview/components/RateLimitBanner';
import { renderComponent } from './helpers/render';

// `resetsAt` is a unix-second timestamp. Build "now + N seconds" relative timestamps.
const nowSec = () => Math.floor(Date.now() / 1000);

describe('RateLimitBanner — countdown format', () => {
  /**
   * Goal: when the reset is in the past (or right now), the banner shows "Resets in now". Pins
   *   the boundary case so the user sees a coherent label rather than a negative number.
   * Process: render with `resetsAt: nowSec()`; assert "now" appears.
   */
  it('renders "now" when the reset has already arrived', () => {
    renderComponent(<RateLimitBanner resetsAt={nowSec()} onDismiss={vi.fn()} />);
    expect(document.body.textContent).toContain('now');
  });

  /**
   * Goal: a wait under an hour renders as "Nm" (rounded up). Pins the minute-only path.
   * Process: render with reset in 5 min; assert "5m" appears.
   */
  it('renders minutes-only for waits under an hour', () => {
    renderComponent(<RateLimitBanner resetsAt={nowSec() + 5 * 60} onDismiss={vi.fn()} />);
    expect(document.body.textContent).toContain('5m');
  });

  /**
   * Goal: a wait that's a whole number of hours renders as "Nh" (no trailing 0m). Pins the
   *   hour-only path.
   * Process: render with reset in 2h; assert "2h" appears and no "0m".
   */
  it('renders hours-only when minutes round to zero', () => {
    renderComponent(<RateLimitBanner resetsAt={nowSec() + 120 * 60} onDismiss={vi.fn()} />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('2h');
    expect(text).not.toContain('0m');
  });

  /**
   * Goal: a mixed hour+minute wait renders as "Nh Mm". Pins the combined path.
   * Process: render with reset in 1h 30m; assert "1h 30m" appears.
   */
  it('renders "Nh Mm" when both hours and minutes are non-zero', () => {
    renderComponent(<RateLimitBanner resetsAt={nowSec() + (60 + 30) * 60} onDismiss={vi.fn()} />);
    expect(document.body.textContent).toContain('1h 30m');
  });
});

describe('RateLimitBanner — Dismiss', () => {
  /**
   * Goal: clicking Dismiss invokes the parent's `onDismiss` callback. Pins the only path that
   *   closes the banner.
   * Process: render with a spy; click the Dismiss button; assert the spy was called.
   */
  it('clicking Dismiss invokes the onDismiss callback', () => {
    const onDismiss = vi.fn();
    renderComponent(<RateLimitBanner resetsAt={nowSec() + 60} onDismiss={onDismiss} />);
    const button = Array.from(document.querySelectorAll('vscode-button')).find((b) =>
      /Dismiss/.test(b.textContent ?? ''),
    ) as HTMLElement;
    fireEvent.click(button);
    expect(onDismiss).toHaveBeenCalled();
  });

  /**
   * Goal: the "Rate limited" header is rendered alongside the countdown so the user understands
   *   why the dialog appeared. Pins the visible label.
   * Process: render; assert both the header and the countdown phrase appear.
   */
  it('renders the "Rate limited" header above the countdown', () => {
    renderComponent(<RateLimitBanner resetsAt={nowSec() + 60} onDismiss={vi.fn()} />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Rate limited');
    expect(text).toContain('Resets in');
  });
});

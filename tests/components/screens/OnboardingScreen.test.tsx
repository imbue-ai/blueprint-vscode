/**
 * Component tests for `OnboardingScreen`.
 *
 * Layer: component (Vitest + React Testing Library + happy-dom). Renders the React component in
 *   isolation; mocks the VS Code messaging bridge at the module boundary and mocks
 *   `sectionInputsValid` so each test states its assumption about input validity explicitly
 *   (the real implementation reads the live DOM, which can't be reliably populated through the
 *   stubbed web-component renderer).
 * Scope: validation rendered or enforced by the component itself — the "Get started" button's
 *   disabled state, the message it dispatches, and the inline errors. This is the authoritative
 *   test for front-end validation that the message-layer integration tests cannot see.
 * Out of scope: how onboarding messages are processed by the backend (covered by integration
 *   tests in `tests/onboarding/`); the input-reading logic in `sectionInputsValid` itself
 *   (covered or to-be-covered as a unit test against `TemplateFormFields`).
 */
import { fireEvent, screen } from '@testing-library/react';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpecSection, TemplateConfig } from '../../../src/types/onboarding';
import type { AppScreen } from '../../../src/types/screens';
import { OnboardingScreen } from '../../../src/webview/screens/OnboardingScreen';
import { renderComponent } from '../helpers/render';

vi.mock('../../../src/webview/components/TemplateFormFields', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, sectionInputsValid: vi.fn() };
});

import { sectionInputsValid } from '../../../src/webview/components/TemplateFormFields';

const sectionInputsValidMock = sectionInputsValid as Mock;

type OnboardingScreenData = Extract<AppScreen, { type: 'onboarding' }>;

const blankSection: SpecSection = { id: 's1', title: '', description: '' };
const validSection: SpecSection = { id: 's1', title: 'Overview', description: 'Of the feature' };

function makeScreen(overrides: Partial<TemplateConfig> & { selectedModel?: string } = {}): OnboardingScreenData {
  const { selectedModel = 'claude-sonnet-4-6', ...config } = overrides;
  return {
    type: 'onboarding',
    selectedModel,
    data: {
      sections: [],
      styles: ['bullet'],
      depth: 'concise',
      notes: '',
      ...config,
    },
  };
}

function clickGetStarted() {
  const button = document.querySelector('vscode-button') as HTMLElement | null;
  if (!button) throw new Error('Get started button not found');
  fireEvent.click(button);
}

beforeEach(() => {
  sectionInputsValidMock.mockReset();
});

describe('OnboardingScreen — Get started button enable/disable', () => {
  /**
   * Goal: the front-end blocks completion when no sections are present. The "Get started" button
   *   MUST be disabled when `data.sections.length === 0`. Without this guard, users could submit
   *   an empty template; the disable is the only thing preventing the click. The disabled state
   *   here is independent of submit-attempted state — empty sections is always a hard block.
   * Process: render with `sections: []`; assert the button has the `disabled` attribute.
   */
  it('is disabled when sections is empty', () => {
    renderComponent(<OnboardingScreen screen={makeScreen({ sections: [] })} />);
    expect(document.querySelector('vscode-button[disabled]')).not.toBeNull();
  });

  /**
   * Goal: the inverse — when at least one section exists, the button is enabled regardless of
   *   the section's title/description content. The empty-title / empty-description checks are
   *   only enforced inside the click handler (after submitAttempted), not via the disabled prop.
   *   Pins that distinction.
   * Process: render with one blank section; assert the button is NOT disabled.
   */
  it('is enabled when sections has at least one entry (even an empty one)', () => {
    renderComponent(<OnboardingScreen screen={makeScreen({ sections: [blankSection] })} />);
    expect(document.querySelector('vscode-button[disabled]')).toBeNull();
  });
});

describe('OnboardingScreen — click handler dispatch', () => {
  /**
   * Goal: clicking "Get started" with valid input posts `completeOnboarding`. This is the only
   *   way the signal reaches the extension host. Catches a regression where a refactor breaks
   *   the click handler, changes the message shape, or accidentally short-circuits dispatch.
   * Process: stub `sectionInputsValid` to return true (validity asserted by the test, not
   *   by the rendered DOM); render with one valid section; click; assert `postMessage` was
   *   called with `{ type: 'completeOnboarding' }`.
   */
  it('clicking with valid input posts completeOnboarding', () => {
    sectionInputsValidMock.mockReturnValue(true);
    const { postMessage } = renderComponent(<OnboardingScreen screen={makeScreen({ sections: [validSection] })} />);
    clickGetStarted();
    expect(postMessage).toHaveBeenCalledWith({ type: 'completeOnboarding' });
  });

  /**
   * Goal: clicking "Get started" with invalid input (any section has an empty title or
   *   description) does NOT post `completeOnboarding`. The handler must short-circuit and let
   *   the user fix the inputs. Pins the front-end as the gate that prevents bad data from
   *   reaching the extension host.
   * Process: stub `sectionInputsValid` to return false; render with one section that has an
   *   empty title; click; assert `postMessage` was never called with `completeOnboarding`.
   */
  it('clicking with invalid input does NOT post completeOnboarding', () => {
    sectionInputsValidMock.mockReturnValue(false);
    const { postMessage } = renderComponent(<OnboardingScreen screen={makeScreen({ sections: [blankSection] })} />);
    clickGetStarted();
    const completeCalls = postMessage.mock.calls.filter(
      ([msg]) => (msg as { type: string }).type === 'completeOnboarding',
    );
    expect(completeCalls).toHaveLength(0);
  });
});

describe('OnboardingScreen — inline errors', () => {
  /**
   * Goal: when sections is empty, the sections collapsible surfaces "At least one section is
   *   required" so the user knows why the button is disabled. The disable alone is silent —
   *   the error text is what makes the requirement discoverable.
   * Process: render with empty sections; assert the error string is in the DOM.
   */
  it('shows the empty-sections error when sections is empty', () => {
    renderComponent(<OnboardingScreen screen={makeScreen({ sections: [] })} />);
    expect(screen.getByText(/at least one section is required/i)).toBeInTheDocument();
  });

  /**
   * Goal: the empty-sections error is conditional, not always rendered. When sections exist,
   *   it must disappear regardless of section content (since other errors fill its slot only
   *   after submit is attempted).
   * Process: render with one (blank) section; assert the empty-sections error is absent.
   */
  it('does not show the empty-sections error when at least one section exists', () => {
    renderComponent(<OnboardingScreen screen={makeScreen({ sections: [blankSection] })} />);
    expect(screen.queryByText(/at least one section is required/i)).toBeNull();
  });

  /**
   * Goal: the empty-title error is gated on submit-attempt — it should NOT appear before the
   *   user has clicked "Get started," even if a section's title is blank. Without this gating,
   *   users would see errors immediately on opening the wizard, which is hostile UX.
   * Process: render with a section that has an empty title; assert the empty-title error
   *   string is absent before any click.
   */
  it('does not show the empty-title error before submit is attempted', () => {
    renderComponent(<OnboardingScreen screen={makeScreen({ sections: [blankSection] })} />);
    expect(screen.queryByText(/section title cannot be empty/i)).toBeNull();
  });

  /**
   * Goal: after a failed submit (validation reports invalid), the empty-title error appears
   *   so the user understands why the click did nothing. This is the failure-disclosure path.
   * Process: stub `sectionInputsValid` to return false (forces submitAttempted=true on click);
   *   render with a section that has an empty title; click; assert the error string is now
   *   in the DOM.
   */
  it('shows the empty-title error after a failed submit', () => {
    sectionInputsValidMock.mockReturnValue(false);
    renderComponent(<OnboardingScreen screen={makeScreen({ sections: [blankSection] })} />);
    clickGetStarted();
    expect(screen.getByText(/section title cannot be empty/i)).toBeInTheDocument();
  });

  /**
   * Goal: same disclosure path for empty descriptions. After a failed submit, when a section has
   *   a filled title but a blank description, the description error appears. Covers the
   *   description branch in `getSectionDescription` independently from the title branch.
   * Process: stub `sectionInputsValid` to return false; render with a section that has a title
   *   but blank description; click; assert the description error is in the DOM.
   */
  it('shows the empty-description error after a failed submit', () => {
    sectionInputsValidMock.mockReturnValue(false);
    const titledNoDesc: SpecSection = { id: 's1', title: 'Overview', description: '' };
    renderComponent(<OnboardingScreen screen={makeScreen({ sections: [titledNoDesc] })} />);
    clickGetStarted();
    expect(screen.getByText(/section description cannot be empty/i)).toBeInTheDocument();
  });
});

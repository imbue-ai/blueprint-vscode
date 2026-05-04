/**
 * Component tests for `SettingsScreen` — the panel users open to change the model and manage
 * templates.
 *
 * Layer: component (Vitest + RTL + happy-dom).
 * Scope: title rendering, model + templates section presence, "+ New" button dispatch, empty
 *   state, per-template rendering with aria-selected highlighting. Selection click and delete
 *   click are exercised via `TemplateListItem`'s own future test or the SettingsView backend
 *   test — here we just verify the items appear with correct selection state.
 * Out of scope: ModelSelector internals (not tested as a leaf component yet); TemplateListItem
 *   delete/select flow (delegated); SettingsView backend (own integration test).
 */
import { fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { PromptTemplate } from '../../../src/types/promptTemplate';
import type { AppScreen } from '../../../src/types/screens';
import { SettingsScreen } from '../../../src/webview/screens/SettingsScreen';
import { renderComponent } from '../helpers/render';

type SettingsScreenData = Extract<AppScreen, { type: 'settings' }>;

function tpl(id: string, name = id): PromptTemplate {
  return {
    id,
    name,
    filename: 'plan.md',
    mode: 'structured',
    prompt: '',
    config: {
      sections: [{ id: 's1', title: 'Overview', description: 'd' }],
      styles: ['bullet'],
      depth: 'concise',
      notes: '',
    },
  };
}

function makeScreen(overrides: Partial<SettingsScreenData> = {}): SettingsScreenData {
  return {
    type: 'settings',
    selectedModel: 'claude-sonnet-4-6',
    templates: [],
    selectedTemplateId: '',
    ...overrides,
  };
}

describe('SettingsScreen — header + sections', () => {
  /**
   * Goal: the Settings title is visible at the top of the panel. Pins the user-orienting label
   *   that distinguishes this view from the main planning surface.
   * Process: render with no templates; assert "Settings" appears.
   */
  it('renders the Settings title', () => {
    renderComponent(<SettingsScreen screen={makeScreen()} />);
    expect(document.body.textContent).toContain('Settings');
  });

  /**
   * Goal: both top-level sections (Model + Templates) are rendered. Pins the layout contract —
   *   the user expects to find both controls on this screen.
   * Process: render; assert both section headers appear in the DOM.
   */
  it('renders the Model and Templates section headers', () => {
    renderComponent(<SettingsScreen screen={makeScreen()} />);
    expect(document.body.textContent).toContain('Model');
    expect(document.body.textContent).toContain('Templates');
  });
});

describe('SettingsScreen — Templates section', () => {
  /**
   * Goal: when no templates exist, the empty state message appears (not a blank list). Pins the
   *   onboarding signal that prompts the user to create their first template.
   * Process: render with empty templates; assert "No templates" appears.
   */
  it('shows the empty state when no templates exist', () => {
    renderComponent(<SettingsScreen screen={makeScreen({ templates: [] })} />);
    expect(document.body.textContent).toContain('No templates');
  });

  /**
   * Goal: each template renders with its name visible. Pins the basic list rendering.
   * Process: render with two templates; assert both names appear.
   */
  it('renders each template by name', () => {
    renderComponent(<SettingsScreen screen={makeScreen({ templates: [tpl('a', 'Alpha'), tpl('b', 'Beta')] })} />);
    expect(document.body.textContent).toContain('Alpha');
    expect(document.body.textContent).toContain('Beta');
  });

  /**
   * Goal: the selected template gets `aria-selected="true"` on its list item. Pins the
   *   accessibility + visual highlight contract.
   * Process: render with two templates and one selectedTemplateId; locate items by role; assert
   *   the matching item has aria-selected=true and the other false.
   */
  it('marks the selected template with aria-selected', () => {
    renderComponent(
      <SettingsScreen screen={makeScreen({ templates: [tpl('a'), tpl('b')], selectedTemplateId: 'b' })} />,
    );
    const items = Array.from(document.querySelectorAll('[role="option"]')) as HTMLElement[];
    const a = items.find((el) => el.textContent?.includes('a'));
    const b = items.find((el) => el.textContent?.includes('b'));
    expect(a?.getAttribute('aria-selected')).toBe('false');
    expect(b?.getAttribute('aria-selected')).toBe('true');
  });

  /**
   * Goal: clicking the "+ New" button dispatches `openTemplateEditor` so the user can create a
   *   new template. Pins the only path that opens the template editor from this screen.
   * Process: render; click the New button (find by aria-label); assert dispatch.
   */
  it('clicking "+ New" dispatches openTemplateEditor', () => {
    const { postMessage } = renderComponent(<SettingsScreen screen={makeScreen()} />);
    const newBtn = document.querySelector('button[aria-label="New template"]') as HTMLButtonElement;
    fireEvent.click(newBtn);
    expect(postMessage).toHaveBeenCalledWith({ type: 'openTemplateEditor' });
  });
});

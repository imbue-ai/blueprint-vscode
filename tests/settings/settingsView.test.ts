/**
 * Integration tests for `SettingsView` — the backend behind the Settings screen (model + template
 * picker, template delete).
 *
 * Layer: integration (Extension Host + Mocha). Drives real `vscode.workspace.getConfiguration`
 *   for the model write and `prompts.deleteTemplate`, plus a real `vscode.Memento`-shaped
 *   in-memory stub for the workspace-state writes.
 * Scope: handleMessage routes (setModel, setSpecTemplate, deleteTemplate), `getScreen` returns
 *   the current model, templates, and resolved selectedTemplateId; deleteTemplate clears
 *   selectedTemplateId when the deleted template was selected.
 * Out of scope: the SettingsScreen component (own test); model lifecycle (covered by
 *   `tests/model/lifecycle.test.ts`); resolveSelectedTemplate semantics (own helper).
 */
import * as assert from 'assert';
import * as vscode from 'vscode';

import type { App } from '../../src/core/app';
import { SettingsView } from '../../src/core/views/settings';
import type { PromptTemplate } from '../../src/types/promptTemplate';

interface StubApp {
  broadcast: () => void;
  broadcastCalls: number;
}

function stubApp(): StubApp {
  let n = 0;
  return {
    broadcast: () => {
      n++;
    },
    get broadcastCalls() {
      return n;
    },
  };
}

class StubMemento implements vscode.Memento {
  private store = new Map<string, unknown>();
  keys(): readonly string[] {
    return Array.from(this.store.keys());
  }
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    return (this.store.get(key) as T | undefined) ?? defaultValue;
  }
  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) this.store.delete(key);
    else this.store.set(key, value);
  }
  setKeysForSync(): void {
    /* not used */
  }
}

async function setTemplates(templates: PromptTemplate[]): Promise<void> {
  await vscode.workspace
    .getConfiguration('blueprint')
    .update('promptTemplates', templates, vscode.ConfigurationTarget.Global);
}

async function clearTemplates(): Promise<void> {
  await vscode.workspace
    .getConfiguration('blueprint')
    .update('promptTemplates', undefined, vscode.ConfigurationTarget.Global);
}

function readTemplates(): PromptTemplate[] {
  return vscode.workspace.getConfiguration('blueprint').get<PromptTemplate[]>('promptTemplates') ?? [];
}

const SELECTED_KEY = 'blueprint.selectedTemplateId';

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

suite('Integration: SettingsView — getScreen', () => {
  teardown(async () => {
    await clearTemplates();
  });

  /**
   * Goal: `getScreen` returns the templates from global config, the current model from session
   *   resolution, and the selected template id (resolved via `resolveSelectedTemplate` so it
   *   falls back to the first template when the persisted id is missing). Pins the data the
   *   Settings screen renders.
   * Process: seed two templates; instantiate with empty memento; assert all three fields appear.
   */
  test('returns templates, model, and resolved selectedTemplateId', async () => {
    await setTemplates([tpl('a'), tpl('b')]);
    const view = new SettingsView(new StubMemento());
    const screen = view.getScreen();
    if (screen.type !== 'settings') return assert.fail('expected settings');
    assert.strictEqual(screen.templates.length, 2);
    assert.ok(screen.selectedModel.length > 0);
    // No persisted selected id → falls back to the first template
    assert.strictEqual(screen.selectedTemplateId, 'a');
  });

  /**
   * Goal: when a `selectedTemplateId` exists in workspace state and matches a template, that id
   *   is reported (not the fallback). Pins the persisted-selection path.
   * Process: seed templates + memento; assert getScreen reports the persisted id.
   */
  test('reports the persisted selectedTemplateId when present', async () => {
    await setTemplates([tpl('a'), tpl('b')]);
    const memento = new StubMemento();
    await memento.update(SELECTED_KEY, 'b');
    const view = new SettingsView(memento);
    const screen = view.getScreen();
    if (screen.type !== 'settings') return assert.fail('expected settings');
    assert.strictEqual(screen.selectedTemplateId, 'b');
  });

  /**
   * Goal: when no templates exist, `selectedTemplateId` is the empty string (not undefined or
   *   null). Pins the empty-state contract that the screen renders without crashing.
   * Process: clear templates; instantiate; assert empty selectedTemplateId.
   */
  test('reports empty selectedTemplateId when no templates exist', async () => {
    await clearTemplates();
    const view = new SettingsView(new StubMemento());
    const screen = view.getScreen();
    if (screen.type !== 'settings') return assert.fail('expected settings');
    assert.strictEqual(screen.templates.length, 0);
    assert.strictEqual(screen.selectedTemplateId, '');
  });
});

suite('Integration: SettingsView — handleMessage', () => {
  teardown(async () => {
    await clearTemplates();
    await vscode.workspace.getConfiguration('blueprint').update('model', undefined, vscode.ConfigurationTarget.Global);
  });

  /**
   * Goal: `setModel` writes the model to global config and broadcasts (via the .then chain).
   *   Pins the only path that mutates the user's saved model preference from this screen.
   * Process: read package.json's enum to pick a non-default model; send setModel; await the
   *   broadcast; assert config now contains it.
   */
  test('setModel writes to global config and broadcasts', async () => {
    const ext = vscode.extensions.getExtension('Imbue.imbue-blueprint')!;
    const prop = ext.packageJSON.contributes.configuration[0].properties['blueprint.model'];
    const values = prop.enum as string[];
    const defaultValue = prop.default as string;
    const target = values.find((m) => m !== defaultValue)!;

    const view = new SettingsView(new StubMemento());
    const app = stubApp();
    view.handleMessage(app as unknown as App, { type: 'setModel', model: target });
    // The handler chains a .then(() => app.broadcast()), so wait briefly for it.
    await new Promise((r) => setTimeout(r, 50));
    const stored = vscode.workspace.getConfiguration('blueprint').get<string>('model');
    assert.strictEqual(stored, target);
    assert.strictEqual(app.broadcastCalls, 1);
  });

  /**
   * Goal: `setSpecTemplate` updates the workspace state's selectedTemplateId AND broadcasts so
   *   the Settings screen re-renders with the new highlight. Pins the picker click → state
   *   update flow.
   * Process: seed two templates; send setSpecTemplate with one of their ids; assert memento now
   *   contains it and broadcast was called.
   */
  test('setSpecTemplate updates workspace state and broadcasts', async () => {
    await setTemplates([tpl('a'), tpl('b')]);
    const memento = new StubMemento();
    const view = new SettingsView(memento);
    const app = stubApp();
    view.handleMessage(app as unknown as App, { type: 'setSpecTemplate', id: 'b' });
    assert.strictEqual(memento.get(SELECTED_KEY), 'b');
    assert.strictEqual(app.broadcastCalls, 1);
  });

  /**
   * Goal: `deleteTemplate` removes the template from global config. Pins the delete-flow first
   *   half — the underlying `prompts.deleteTemplate` does the write.
   * Process: seed two templates; deleteTemplate one of them; await the async config write;
   *   assert it's gone.
   */
  test('deleteTemplate removes the template from global config', async () => {
    await setTemplates([tpl('a'), tpl('b')]);
    const view = new SettingsView(new StubMemento());
    const app = stubApp();
    view.handleMessage(app as unknown as App, { type: 'deleteTemplate', templateId: 'a' });
    await new Promise((r) => setTimeout(r, 100));
    const remaining = readTemplates();
    assert.strictEqual(remaining.length, 1);
    assert.strictEqual(remaining[0].id, 'b');
    assert.strictEqual(app.broadcastCalls, 1);
  });

  /**
   * Goal: when the deleted template was the *selected* one, the workspace-state
   *   `selectedTemplateId` is updated to the next resolved template (so the user doesn't end up
   *   selecting a deleted template). Pins the cleanup that prevents the screen from showing a
   *   ghost selection.
   * Process: seed [a, b], persist 'a' as selected, delete 'a'; await; assert memento now points
   *   to 'b' (the new resolved fallback).
   */
  test('deleteTemplate clears selectedTemplateId when the deleted template was selected', async () => {
    await setTemplates([tpl('a'), tpl('b')]);
    const memento = new StubMemento();
    await memento.update(SELECTED_KEY, 'a');
    const view = new SettingsView(memento);
    const app = stubApp();
    view.handleMessage(app as unknown as App, { type: 'deleteTemplate', templateId: 'a' });
    await new Promise((r) => setTimeout(r, 100));
    assert.strictEqual(memento.get(SELECTED_KEY), 'b', 'memento should now point to the surviving template');
  });
});

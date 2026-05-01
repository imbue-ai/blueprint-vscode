/**
 * Integration tests for `TemplateEditorView` — the backend behind the "Edit / New template" view
 * launched from the Settings screen.
 *
 * Layer: integration (Extension Host + Mocha). Uses real `vscode.workspace.getConfiguration`
 *   for `getTemplate`/`createTemplate`/`saveTemplate` round-trips; real `vscode.Memento` for
 *   the workspace-state writes that the create-flow performs.
 * Scope: constructor (defaults vs load-existing); message handlers — mode/name/filename/raw
 *   prompt setters, section CRUD (add preset, add blank, remove, update, move up/down),
 *   styles/depth/notes setters; save() validation (no-op on empty name or filename) and the
 *   create vs edit branches (writes config + closes view + broadcasts).
 * Out of scope: the TemplateEditorScreen component (own test); the prompts.ts helpers
 *   (`buildPromptFromConfig`, etc.) — values, exercised indirectly here.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';

import type { App, AppContext } from '../../src/core/app';
import { TemplateEditorView } from '../../src/core/views/templateEditor';
import type { PromptTemplate } from '../../src/types/promptTemplate';

interface StubApp {
  broadcast: () => void;
  broadcastCalls: number;
  closeView: () => void;
  closeViewCalls: number;
  ctx: AppContext;
}

function stubApp(): StubApp {
  let broadcasts = 0;
  let closes = 0;
  return {
    broadcast: () => {
      broadcasts++;
    },
    closeView: () => {
      closes++;
    },
    get broadcastCalls() {
      return broadcasts;
    },
    get closeViewCalls() {
      return closes;
    },
    get ctx() {
      // Real workspaceState — needed for the create branch's selectedTemplateId write.
      const ext = vscode.extensions.getExtension('Imbue.imbue-blueprint')!;
      return { context: { workspaceState: ext.exports?.__test?.app?.ctx.context.workspaceState } } as AppContext;
    },
  };
}

async function clearTemplates(): Promise<void> {
  await vscode.workspace
    .getConfiguration('blueprint')
    .update('promptTemplates', undefined, vscode.ConfigurationTarget.Global);
}

async function setTemplates(templates: PromptTemplate[]): Promise<void> {
  await vscode.workspace
    .getConfiguration('blueprint')
    .update('promptTemplates', templates, vscode.ConfigurationTarget.Global);
}

function readTemplates(): PromptTemplate[] {
  return vscode.workspace.getConfiguration('blueprint').get<PromptTemplate[]>('promptTemplates') ?? [];
}

const sampleExisting: PromptTemplate = {
  id: 'tpl-1',
  name: 'Existing',
  filename: 'plan.md',
  mode: 'freeform',
  prompt: 'raw template body',
  config: {
    sections: [{ id: 's1', title: 'Overview', description: 'desc' }],
    styles: ['diagrams'],
    depth: 'comprehensive',
    notes: 'some notes',
  },
};

suite('Integration: TemplateEditorView — constructor', () => {
  suiteSetup(async () => {
    await clearTemplates();
  });
  teardown(async () => {
    await clearTemplates();
  });

  /**
   * Goal: with no templateId, the view starts in the "create" mode with safe defaults: empty
   *   name, `plan.md` filename, structured mode, default sections/styles/depth, empty rawPrompt.
   *   Pins the new-template UX.
   * Process: instantiate without an id; assert the screen reports `isCreate: true` and the
   *   default seed values.
   */
  test('initializes with defaults when no templateId is provided', () => {
    const view = new TemplateEditorView();
    const screen = view.getScreen();
    if (screen.type !== 'templateEditor') return assert.fail('expected templateEditor');
    assert.strictEqual(screen.isCreate, true);
    assert.strictEqual(screen.name, '');
    assert.strictEqual(screen.filename, 'plan.md');
    assert.strictEqual(screen.mode, 'structured');
    assert.strictEqual(screen.rawPrompt, '');
    assert.ok(screen.data.sections.length > 0, 'should seed with default sections');
  });

  /**
   * Goal: with a known templateId, the view loads that template's fields. Pins the edit-existing
   *   path that lets the user pick up where they left off.
   * Process: seed config with `sampleExisting`; instantiate with its id; assert each field
   *   round-trips.
   */
  test('loads existing template fields when templateId is known', async () => {
    await setTemplates([sampleExisting]);
    const view = new TemplateEditorView('tpl-1');
    const screen = view.getScreen();
    if (screen.type !== 'templateEditor') return assert.fail('expected templateEditor');
    assert.strictEqual(screen.isCreate, false);
    assert.strictEqual(screen.name, 'Existing');
    assert.strictEqual(screen.filename, 'plan.md');
    assert.strictEqual(screen.mode, 'freeform');
    assert.strictEqual(screen.rawPrompt, 'raw template body');
    assert.deepStrictEqual(screen.data.styles, ['diagrams']);
    assert.strictEqual(screen.data.depth, 'comprehensive');
    assert.strictEqual(screen.data.notes, 'some notes');
  });

  /**
   * Goal: an unknown templateId still falls back to defaults rather than throwing — the view
   *   should remain usable even if the template was deleted between menu open and view enter.
   *   Pins the defensive fallback.
   * Process: instantiate with a bogus id; assert defaults are seeded and `isCreate` is false
   *   (since a templateId was passed).
   */
  test('falls back to defaults when templateId does not match any template', () => {
    const view = new TemplateEditorView('does-not-exist');
    const screen = view.getScreen();
    if (screen.type !== 'templateEditor') return assert.fail('expected templateEditor');
    assert.strictEqual(screen.name, '');
    assert.strictEqual(screen.isCreate, false, 'still treated as edit (templateId was passed)');
  });
});

suite('Integration: TemplateEditorView — simple setters', () => {
  /**
   * Goal: `setTemplateEditorName/Filename/RawPrompt/Mode` update their respective fields and
   *   broadcast. Pins the basic input → state pattern shared by all simple setters.
   * Process: drive each setter; assert each field updates and broadcast was called once per
   *   message.
   */
  test('name / filename / rawPrompt / mode setters all update + broadcast', () => {
    const view = new TemplateEditorView();
    const app = stubApp();
    view.handleMessage(app as unknown as App, { type: 'setTemplateEditorName', name: 'My plan' });
    view.handleMessage(app as unknown as App, { type: 'setTemplateEditorFilename', filename: 'feature.md' });
    view.handleMessage(app as unknown as App, { type: 'setTemplateEditorMode', mode: 'freeform' });
    view.handleMessage(app as unknown as App, { type: 'setTemplateEditorRawPrompt', prompt: 'free body' });

    const screen = view.getScreen();
    if (screen.type !== 'templateEditor') return assert.fail('expected templateEditor');
    assert.strictEqual(screen.name, 'My plan');
    assert.strictEqual(screen.filename, 'feature.md');
    assert.strictEqual(screen.mode, 'freeform');
    assert.strictEqual(screen.rawPrompt, 'free body');
    assert.strictEqual(app.broadcastCalls, 4);
  });

  /**
   * Goal: `setTemplateStyles`, `setTemplateDepth`, `setTemplateNotes` update the config payload
   *   that ships with the screen. Pins symmetric coverage with the basic setters.
   * Process: drive each; assert getScreen.data reflects them.
   */
  test('styles / depth / notes setters update the config payload', () => {
    const view = new TemplateEditorView();
    const app = stubApp();
    view.handleMessage(app as unknown as App, { type: 'setTemplateStyles', styles: ['diagrams'] });
    view.handleMessage(app as unknown as App, { type: 'setTemplateDepth', depth: 'comprehensive' });
    view.handleMessage(app as unknown as App, { type: 'setTemplateNotes', notes: 'be terse' });

    const screen = view.getScreen();
    if (screen.type !== 'templateEditor') return assert.fail('expected templateEditor');
    assert.deepStrictEqual(screen.data.styles, ['diagrams']);
    assert.strictEqual(screen.data.depth, 'comprehensive');
    assert.strictEqual(screen.data.notes, 'be terse');
  });
});

suite('Integration: TemplateEditorView — section CRUD', () => {
  /**
   * Goal: `addTemplateSection` with a preset key appends a section seeded from that preset
   *   (so the user gets the canonical title + description rather than a blank row). Pins the
   *   preset-add path used by the picker dropdown.
   * Process: capture the section count; addTemplateSection with `presetKey: 'overview'`; assert
   *   one new section appears with a non-empty title.
   */
  test('addTemplateSection with a preset key appends a seeded section', () => {
    const view = new TemplateEditorView();
    const app = stubApp();
    const before = (view.getScreen() as { type: 'templateEditor'; data: { sections: unknown[] } }).data.sections.length;
    view.handleMessage(app as unknown as App, { type: 'addTemplateSection', presetKey: 'overview' });
    const screen = view.getScreen();
    if (screen.type !== 'templateEditor') return assert.fail('expected templateEditor');
    assert.strictEqual(screen.data.sections.length, before + 1);
    const last = screen.data.sections[screen.data.sections.length - 1];
    assert.ok(last.title.length > 0, 'preset section should have a non-empty title');
  });

  /**
   * Goal: `addTemplateSection` with a null preset appends a blank section (the user will fill
   *   it in). Pins the manual-add path.
   * Process: addTemplateSection with `presetKey: null`; assert the new last section has empty
   *   title and description.
   */
  test('addTemplateSection with null preset appends a blank section', () => {
    const view = new TemplateEditorView();
    const app = stubApp();
    view.handleMessage(app as unknown as App, { type: 'addTemplateSection', presetKey: null });
    const screen = view.getScreen();
    if (screen.type !== 'templateEditor') return assert.fail('expected templateEditor');
    const last = screen.data.sections[screen.data.sections.length - 1];
    assert.strictEqual(last.title, '');
    assert.strictEqual(last.description, '');
  });

  /**
   * Goal: `updateTemplateSection` mutates the matching section's title + description by id.
   *   Pins the inline-edit path that runs on every keystroke in the section editor.
   * Process: capture an existing section's id; update its title; assert the update sticks.
   */
  test('updateTemplateSection updates title + description by id', () => {
    const view = new TemplateEditorView();
    const app = stubApp();
    const initialScreen = view.getScreen();
    if (initialScreen.type !== 'templateEditor') return assert.fail('expected templateEditor');
    const id = initialScreen.data.sections[0].id;
    view.handleMessage(app as unknown as App, {
      type: 'updateTemplateSection',
      sectionId: id,
      title: 'New title',
      description: 'New desc',
    });
    const screen = view.getScreen();
    if (screen.type !== 'templateEditor') return assert.fail('expected templateEditor');
    const updated = screen.data.sections.find((s) => s.id === id)!;
    assert.strictEqual(updated.title, 'New title');
    assert.strictEqual(updated.description, 'New desc');
  });

  /**
   * Goal: `removeTemplateSection` filters out the matching section by id. Pins the delete path.
   * Process: count sections; delete one; assert count dropped by exactly one and the deleted id
   *   is gone.
   */
  test('removeTemplateSection deletes by id', () => {
    const view = new TemplateEditorView();
    const app = stubApp();
    const initial = (view.getScreen() as { type: 'templateEditor'; data: { sections: { id: string }[] } }).data
      .sections;
    const idToRemove = initial[0].id;
    view.handleMessage(app as unknown as App, { type: 'removeTemplateSection', sectionId: idToRemove });
    const screen = view.getScreen();
    if (screen.type !== 'templateEditor') return assert.fail('expected templateEditor');
    assert.strictEqual(screen.data.sections.length, initial.length - 1);
    assert.ok(!screen.data.sections.find((s) => s.id === idToRemove));
  });

  /**
   * Goal: `moveTemplateSection` swaps adjacent sections in the requested direction. Pins the
   *   reorder UX that lets the user customize section order.
   * Process: addTemplateSection to ensure ≥2 sections; capture order; move the second up;
   *   assert the order swapped.
   */
  test('moveTemplateSection swaps adjacent sections', () => {
    const view = new TemplateEditorView();
    const app = stubApp();
    view.handleMessage(app as unknown as App, { type: 'addTemplateSection', presetKey: null });
    const before = (view.getScreen() as { type: 'templateEditor'; data: { sections: { id: string }[] } }).data.sections;
    const secondId = before[1].id;
    view.handleMessage(app as unknown as App, {
      type: 'moveTemplateSection',
      sectionId: secondId,
      direction: 'up',
    });
    const screen = view.getScreen();
    if (screen.type !== 'templateEditor') return assert.fail('expected templateEditor');
    assert.strictEqual(screen.data.sections[0].id, secondId, 'second moved to first');
  });

  /**
   * Goal: moving a section past either end is a silent no-op (no throw, no broadcast). Pins
   *   the boundary guard so the reorder buttons can be left enabled at the ends without
   *   crashing.
   * Process: try moving the first section up and the last section down; assert nothing changes.
   */
  test('moveTemplateSection ignores out-of-bounds requests', () => {
    const view = new TemplateEditorView();
    const app = stubApp();
    const before = (view.getScreen() as { type: 'templateEditor'; data: { sections: { id: string }[] } }).data.sections;
    view.handleMessage(app as unknown as App, {
      type: 'moveTemplateSection',
      sectionId: before[0].id,
      direction: 'up',
    });
    view.handleMessage(app as unknown as App, {
      type: 'moveTemplateSection',
      sectionId: before[before.length - 1].id,
      direction: 'down',
    });
    const after = (view.getScreen() as { type: 'templateEditor'; data: { sections: { id: string }[] } }).data.sections;
    assert.deepStrictEqual(
      after.map((s) => s.id),
      before.map((s) => s.id),
      'order should be unchanged',
    );
  });
});

suite('Integration: TemplateEditorView — save', () => {
  teardown(async () => {
    await clearTemplates();
  });

  /**
   * Goal: `saveTemplateEditor` with an empty (or whitespace-only) name is a no-op — does not
   *   close the view, does not write config. Pins the validation gate that prevents nameless
   *   templates from being persisted.
   * Process: name is empty by default; saveTemplateEditor; assert no view-close, no template in
   *   config.
   */
  test('save is a no-op when name is empty', async () => {
    const view = new TemplateEditorView();
    const app = stubApp();
    view.handleMessage(app as unknown as App, { type: 'setTemplateEditorFilename', filename: 'p.md' });
    view.handleMessage(app as unknown as App, { type: 'saveTemplateEditor' });
    // No async work was kicked off, but be defensive: yield to the microtask queue
    await new Promise((r) => setTimeout(r, 10));
    assert.strictEqual(app.closeViewCalls, 0);
    assert.strictEqual(readTemplates().length, 0);
  });

  /**
   * Goal: `saveTemplateEditor` with an empty filename is also rejected. Pins symmetric
   *   validation.
   * Process: set name only; saveTemplateEditor; assert no-op.
   */
  test('save is a no-op when filename is empty', async () => {
    const view = new TemplateEditorView();
    const app = stubApp();
    view.handleMessage(app as unknown as App, { type: 'setTemplateEditorName', name: 'X' });
    view.handleMessage(app as unknown as App, { type: 'setTemplateEditorFilename', filename: '   ' });
    view.handleMessage(app as unknown as App, { type: 'saveTemplateEditor' });
    await new Promise((r) => setTimeout(r, 10));
    assert.strictEqual(app.closeViewCalls, 0);
    assert.strictEqual(readTemplates().length, 0);
  });

  /**
   * Goal: a complete save (name + filename) on the create path writes a new template to global
   *   config and closes the view. Pins the create-flow happy path.
   * Process: set name + filename; save; wait briefly for the async config write; assert
   *   readTemplates() contains a matching template and closeView was called.
   */
  test('save (create) writes a new template + closes the view', async () => {
    const view = new TemplateEditorView();
    const app = stubApp();
    view.handleMessage(app as unknown as App, { type: 'setTemplateEditorName', name: 'Plan' });
    view.handleMessage(app as unknown as App, { type: 'setTemplateEditorFilename', filename: 'plan.md' });
    view.handleMessage(app as unknown as App, { type: 'saveTemplateEditor' });
    await new Promise((r) => setTimeout(r, 100));

    const templates = readTemplates();
    assert.strictEqual(templates.length, 1);
    assert.strictEqual(templates[0].name, 'Plan');
    assert.strictEqual(templates[0].filename, 'plan.md');
    assert.strictEqual(app.closeViewCalls, 1);
  });
});

/**
 * Exhaustiveness tests for the message-routing and screen-rendering tables.
 *
 * Layer: integration (Extension Host + Mocha). Reads source files at runtime via fs to find
 *   handler / render references; doesn't try to drive each message into the App.
 * Scope: every `SidebarOutMessage` variant must be handled by at least one of:
 *   - The App itself (top-level routing in `app.ts`),
 *   - A state in `core/states/*`,
 *   - A view in `core/views/*`,
 *   - The SidebarProvider (`sidebarProvider.ts`, where `openLink` lives).
 *
 *   And every `AppScreen.type` discriminant must be rendered by at least one webview component
 *   (file in `webview/screens/*` or referenced from `webview/App.tsx`).
 *
 *   Catches the "added a new message/screen variant but forgot to wire it up" bug class — both
 *   the type and its handler need to land together or the test screams.
 * Out of scope: per-handler logic (covered by each state's unit test); whether the handler does
 *   the right thing (covered by workflow tests).
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// Hardcoded list of every variant in SidebarOutMessage. Update this when adding a new message
// type — and the corresponding wire-up in a state/view/App. The test then verifies the wire-up
// landed.
const SIDEBAR_OUT_MESSAGE_TYPES: string[] = [
  'requestData',
  'openLink',
  'returnFromView',
  'openNewSpecView',
  'openSettings',
  'completeOnboarding',
  'addTemplateSection',
  'removeTemplateSection',
  'updateTemplateSection',
  'moveTemplateSection',
  'setTemplateStyles',
  'setTemplateDepth',
  'setTemplateNotes',
  'setModel',
  'deleteTemplate',
  'setSpecTemplate',
  'setPrompt',
  'submitSpecPrompt',
  'openExistingSpec',
  'openTemplateEditor',
  'setTemplateEditorMode',
  'setTemplateEditorName',
  'setTemplateEditorFilename',
  'setTemplateEditorRawPrompt',
  'saveTemplateEditor',
  'answerPromptQuestion',
  'refinePrompt',
  'generateSpec',
  'setDraftMessage',
  'sendMessage',
  'submitSpecFeedback',
  'openSpec',
  'addFeedback',
  'editFeedback',
  'deleteFeedback',
  'specFileChanged',
  'answerPanelQuestion',
  'submitPanelAnswers',
  'refreshPanelQuestions',
  'toggleQuestionsPanel',
  'jumpToLine',
  'jumpToLineNumber',
];

// Hardcoded list of every AppScreen discriminant. Update when adding a new screen type.
const APP_SCREEN_TYPES: string[] = [
  'onboarding',
  'prompt',
  'promptRefinement',
  'specEditing',
  'settings',
  'templateEditor',
];

// __dirname here is `<project>/out/tests/app` because Mocha runs the compiled JS. Go up three
// levels to land at the project root, then descend into the source tree we want to scan.
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC_ROOT = path.join(PROJECT_ROOT, 'src');

function readAll(dir: string): string {
  let out = '';
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out += readAll(full);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      out += '\n' + fs.readFileSync(full, 'utf-8');
    }
  }
  return out;
}

const allHandlerSources = readAll(path.join(SRC_ROOT, 'core')) + readAll(path.join(SRC_ROOT));
const allWebviewSources = readAll(path.join(SRC_ROOT, 'webview'));

suite('Integration: message exhaustiveness', () => {
  /**
   * Goal: the hardcoded message list matches the union in `messages.ts`. Pins that the test's
   *   knowledge of message types stays in sync with the actual type definition — if you add a
   *   new variant to the union, this test fails until you also add it to the list.
   * Process: read messages.ts; extract every `type: '...'` string literal in the union
   *   declaration; assert the set equals SIDEBAR_OUT_MESSAGE_TYPES.
   */
  test('SIDEBAR_OUT_MESSAGE_TYPES matches the union in messages.ts', () => {
    const messagesSrc = fs.readFileSync(path.join(SRC_ROOT, 'types', 'messages.ts'), 'utf-8');
    // The lazy `?;` in a single regex can't span the SidebarOutMessage union because the union
    // members contain `;` characters inside nested object types (e.g. `{ type: 'foo'; url: ... }`).
    // Instead: find the start of the SidebarOutMessage declaration and walk forward through the
    // file, picking up `type: '...'` literals until we hit the next `export type` or end of file.
    const startIdx = messagesSrc.indexOf('export type SidebarOutMessage');
    assert.notStrictEqual(startIdx, -1, 'expected to find SidebarOutMessage in messages.ts');
    const after = messagesSrc.slice(startIdx);
    const nextExportIdx = after.indexOf('export type ', 'export type SidebarOutMessage'.length);
    const body = nextExportIdx === -1 ? after : after.slice(0, nextExportIdx);

    const found = new Set<string>();
    for (const lit of body.matchAll(/type:\s*'([^']+)'/g)) {
      found.add(lit[1]);
    }
    const declared = new Set(SIDEBAR_OUT_MESSAGE_TYPES);
    const missingFromList = [...found].filter((t) => !declared.has(t));
    const extraInList = [...declared].filter((t) => !found.has(t));
    assert.deepStrictEqual(missingFromList, [], `messages added to types but not to test list: ${missingFromList}`);
    assert.deepStrictEqual(extraInList, [], `messages in test list but no longer in type union: ${extraInList}`);
  });

  /**
   * Goal: every message type appears in at least one handler source file. Pins the wire-up — if
   *   a message type is declared but no handler file references the literal string, it's
   *   orphaned.
   * Process: for each message type, search the union of all handler sources (core + sidebar) for
   *   the literal string. Report the orphans as a list rather than failing on the first one.
   */
  test('every message type is referenced by at least one handler source', () => {
    const orphans: string[] = [];
    for (const type of SIDEBAR_OUT_MESSAGE_TYPES) {
      // Match the literal string inside source quotes — `'foo'` or `"foo"` — to avoid false
      // positives from substring matches like "openSpec" inside "openSpecView".
      const pattern = new RegExp(`['"\`]${type}['"\`]`);
      if (!pattern.test(allHandlerSources)) {
        orphans.push(type);
      }
    }
    assert.deepStrictEqual(orphans, [], `unhandled message types: ${orphans.join(', ')}`);
  });
});

suite('Integration: screen exhaustiveness', () => {
  /**
   * Goal: the hardcoded screen list matches the union in `screens.ts`. Same pattern as the
   *   message-list check.
   * Process: read screens.ts; extract every `type:` literal in the AppScreen union; assert
   *   set equality with APP_SCREEN_TYPES.
   */
  test('APP_SCREEN_TYPES matches the union in screens.ts', () => {
    const screensSrc = fs.readFileSync(path.join(SRC_ROOT, 'types', 'screens.ts'), 'utf-8');
    const found = new Set<string>();
    // The screen variants are `interface XScreen { type: 'xyz'; ... }`. Match interface bodies
    // whose name ends in `Screen` and pick the discriminant. This restricts us to AppScreen
    // members and ignores other unions in the file (StreamItem, etc.).
    for (const m of screensSrc.matchAll(/interface\s+\w+Screen\s*\{[\s\S]+?type:\s*'([^']+)'/g)) {
      found.add(m[1]);
    }
    const declared = new Set(APP_SCREEN_TYPES);
    const missingFromList = [...found].filter((t) => !declared.has(t));
    const extraInList = [...declared].filter((t) => !found.has(t));
    assert.deepStrictEqual(missingFromList, [], `screens added to types but not to test list: ${missingFromList}`);
    assert.deepStrictEqual(extraInList, [], `screens in test list but no longer in type union: ${extraInList}`);
  });

  /**
   * Goal: every screen type is referenced by at least one webview source file. Pins that
   *   adding a new screen variant doesn't render a blank panel because nobody wired up the
   *   render branch.
   * Process: for each screen type literal, search the union of all webview/* sources.
   */
  test('every screen type is referenced by at least one webview source', () => {
    const orphans: string[] = [];
    for (const type of APP_SCREEN_TYPES) {
      const pattern = new RegExp(`['"\`]${type}['"\`]`);
      if (!pattern.test(allWebviewSources)) {
        orphans.push(type);
      }
    }
    assert.deepStrictEqual(orphans, [], `unrendered screen types: ${orphans.join(', ')}`);
  });
});

suite('Integration: command + config exhaustiveness', () => {
  /**
   * Goal: every command ID declared in `package.json contributes.commands` is registered
   *   somewhere in the source code. Pins that we don't ship a manifest declaring commands the
   *   user can run from the palette but which don't actually do anything.
   * Process: read package.json; extract `contributes.commands[].command`; for each, search
   *   the source tree for the literal.
   */
  test('every contributed command id is registered in source', () => {
    const pkgJson = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'));
    const commands: string[] = (pkgJson.contributes?.commands ?? []).map((c: { command: string }) => c.command);
    assert.ok(commands.length > 0, 'expected at least one contributed command in package.json');

    const allSrc = readAll(SRC_ROOT);
    const orphans: string[] = [];
    for (const cmd of commands) {
      const pattern = new RegExp(`['"\`]${cmd}['"\`]`);
      if (!pattern.test(allSrc)) {
        orphans.push(cmd);
      }
    }
    assert.deepStrictEqual(orphans, [], `commands declared in package.json with no source impl: ${orphans.join(', ')}`);
  });

  /**
   * Goal: every config key declared in `package.json contributes.configuration[*].properties` is
   *   read by at least one source file. Pins that we don't show settings to the user that the
   *   extension never reads.
   * Process: read package.json; extract config keys (with the `blueprint.` prefix stripped);
   *   for each, search the source tree for the bare key.
   */
  test('every contributed configuration key is read in source', () => {
    const pkgJson = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'));
    const configurations = pkgJson.contributes?.configuration ?? [];
    const allSrc = readAll(SRC_ROOT);
    const orphans: string[] = [];
    for (const cfg of configurations) {
      for (const fullKey of Object.keys(cfg.properties ?? {})) {
        // Config keys are namespaced (e.g. "blueprint.model"); strip the namespace because that's
        // how source code reads them via getConfiguration('blueprint').get('model').
        const bare = fullKey.replace(/^[^.]+\./, '');
        const pattern = new RegExp(`['"\`]${bare}['"\`]`);
        if (!pattern.test(allSrc)) {
          orphans.push(fullKey);
        }
      }
    }
    assert.deepStrictEqual(
      orphans,
      [],
      `config keys declared in package.json with no read site: ${orphans.join(', ')}`,
    );
  });
});

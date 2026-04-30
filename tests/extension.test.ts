/**
 * Smoke tests for extension activation and contribution wiring.
 *
 * Layer: VS Code integration (Extension Host). No fakes, no harness.
 * Scope: confirms the extension is discoverable, activates cleanly, and every
 *   command declared in `package.json` is actually registered.
 * Failure here means a wiring regression in `extension.ts` or `package.json`.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'Imbue.imbue-blueprint';

suite('Blueprint extension', () => {
  /**
   * Goal: confirm the extension is installed and discoverable to VS Code by its publisher-qualified id.
   * Process: look up `Imbue.imbue-blueprint` via `vscode.extensions.getExtension`; assert it resolves.
   */
  test('extension is present', () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `extension ${EXTENSION_ID} not found`);
  });

  /**
   * Goal: confirm `activate()` runs to completion without throwing.
   * Process: call `ext.activate()`; assert `ext.isActive` is true after the promise resolves.
   */
  test('extension activates', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    await ext?.activate();
    assert.strictEqual(ext?.isActive, true);
  });

  /**
   * Goal: confirm every command declared in `package.json` has a matching `registerCommand` at runtime.
   *   Reads the contributed list dynamically so adding/renaming a command updates the assertion automatically.
   * Process: activate the extension; pull `contributes.commands` from `ext.packageJSON`; query
   *   `vscode.commands.getCommands(true)`; assert every contributed id is in the registered set.
   */
  test('all contributed commands are registered', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    await ext?.activate();
    const registered = new Set(await vscode.commands.getCommands(true));
    const contributed = (ext?.packageJSON.contributes?.commands ?? []).map((c: { command: string }) => c.command);
    for (const cmd of contributed) {
      assert.ok(registered.has(cmd), `command not registered: ${cmd}`);
    }
  });
});

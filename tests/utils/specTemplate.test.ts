/**
 * Integration tests for `utils/specTemplate.ts` — writes and cleans up the temporary spec-template
 * file that the editing/questioning agents read to understand the user's chosen plan structure.
 *
 * Layer: integration (Extension Host + Mocha). Real `os.tmpdir()` writes; uses real
 *   `vscode.workspace.getConfiguration` for the `resolveSelectedTemplate` lookup inside
 *   `writeSpecTemplateFile`.
 * Scope: writeSpecTemplateFile creates a file under tmpdir with the resolved template content;
 *   the path uses the `blueprint-spec-template-` prefix that `toolUse.ts` keys off when filtering
 *   tool calls; cleanupSpecTemplateFile is null-safe and removes the file. The async unlink
 *   means the cleanup test waits before asserting absence.
 * Out of scope: prompts.ts template resolution (own integration tests); toolUse's hidden-call
 *   filter (own unit test).
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import type { PromptTemplate } from '../../src/types/promptTemplate';
import { cleanupSpecTemplateFile, writeSpecTemplateFile } from '../../src/utils/specTemplate';

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

const sampleTemplate: PromptTemplate = {
  id: 'tpl-spec-test',
  name: 'Test',
  filename: 'plan.md',
  mode: 'freeform',
  prompt: 'CUSTOM TEMPLATE BODY',
  config: { sections: [], styles: ['bullet'], depth: 'concise', notes: '' },
};

suite('Integration: specTemplate — writeSpecTemplateFile', () => {
  teardown(async () => {
    await clearTemplates();
  });

  /**
   * Goal: the file is created under `os.tmpdir()` with the `blueprint-spec-template-` prefix.
   *   Pins the path shape that `toolUse.ts` filters on so internal Read calls to this file are
   *   hidden from the activity stream.
   * Process: write with no specific template; assert the returned path lives under tmpdir and
   *   matches the expected prefix; clean up.
   */
  test('writes a file under tmpdir with the expected prefix', () => {
    const filePath = writeSpecTemplateFile('any-id');
    try {
      assert.ok(filePath.startsWith(os.tmpdir()), 'should live under tmpdir');
      assert.ok(path.basename(filePath).startsWith('blueprint-spec-template-'), 'should use the agreed prefix');
      assert.ok(fs.existsSync(filePath), 'file should be created on disk');
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  /**
   * Goal: the file content is the resolved template's body (after `wrapTemplatePrompt`). When a
   *   matching template exists in config, its `prompt` field shows up inside the wrapped output.
   *   Pins the resolution path used to seed each editing agent with the user's chosen template.
   * Process: seed a template; write; assert the file contains the template's prompt body.
   */
  test('writes the resolved template body for a known templateId', async () => {
    await setTemplates([sampleTemplate]);
    const filePath = writeSpecTemplateFile('tpl-spec-test');
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.ok(content.includes('CUSTOM TEMPLATE BODY'), 'content should include the resolved template body');
    } finally {
      fs.unlinkSync(filePath);
    }
  });
});

suite('Integration: specTemplate — cleanupSpecTemplateFile', () => {
  /**
   * Goal: passing `null` is a silent no-op (no throw). Pins the defensive guard — callers carry
   *   `specTemplatePath: string | null` and need to call cleanup unconditionally on interrupt
   *   without a null check.
   * Process: call with null; assert no throw.
   */
  test('is a silent no-op when given null', () => {
    assert.doesNotThrow(() => cleanupSpecTemplateFile(null));
  });

  /**
   * Goal: cleanup removes the file from disk. Pins the unlink contract — without it, the tmpdir
   *   would accumulate stale spec-template files across sessions.
   * Process: write a file; cleanup; wait for the async unlink; assert the file is gone.
   */
  test('unlinks the file from disk', async () => {
    const filePath = writeSpecTemplateFile('any');
    assert.ok(fs.existsSync(filePath));
    cleanupSpecTemplateFile(filePath);
    // unlink is async with no callback we can await; poll briefly.
    for (let i = 0; i < 20; i++) {
      if (!fs.existsSync(filePath)) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.ok(!fs.existsSync(filePath), 'file should have been unlinked');
  });
});

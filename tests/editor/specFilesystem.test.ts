/**
 * Integration tests for `SpecFileSystemProvider` — the virtual filesystem provider that exposes
 * spec files under the `blueprint-spec://` scheme so VS Code can open them as documents while
 * the agent edits the underlying files.
 *
 * Layer: integration (Extension Host + Mocha). Uses real `fs` under a tmpdir; uses real
 *   `vscode` types for FileSystemError / Uri / FilePermission.
 * Scope: stat/read/write/delete/rename round-trips, the read-only gate (when the editor agent is
 *   working, the spec file is reported as Readonly and writes throw NoPermissions), spec-uri
 *   tracking via setSpecFile, fileChanged event firing on relevant transitions.
 * Out of scope: how `Editor` registers the provider with `vscode.workspace.registerFileSystemProvider`
 *   (covered by extension activation); how the App calls `setReadOnly` based on agent status
 *   (covered by editor.ts itself, exercised via workflow tests).
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { SPEC_SCHEME, SpecFileSystemProvider } from '../../src/editor/specFilesystem';

function makeWorkingDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-fs-test-'));
}

function rmrf(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

suite('Integration: SpecFileSystemProvider — basic I/O', () => {
  /**
   * Goal: `readFile` returns the bytes of an existing file under the working dir. Pins the
   *   happy-path read.
   * Process: create a file with known content under tmp dir; instantiate provider; call
   *   readFile via the spec URI; assert content matches.
   */
  test('readFile returns the underlying file bytes', () => {
    const dir = makeWorkingDir();
    try {
      fs.writeFileSync(path.join(dir, 'spec.md'), '# Hello\n');
      const provider = new SpecFileSystemProvider(dir);
      const uri = vscode.Uri.parse(`${SPEC_SCHEME}:/spec.md`);
      const bytes = provider.readFile(uri);
      assert.strictEqual(Buffer.from(bytes).toString(), '# Hello\n');
    } finally {
      rmrf(dir);
    }
  });

  /**
   * Goal: `readFile` on a missing path throws `FileNotFound` (not a generic ENOENT). Pins the
   *   error mapping VS Code expects.
   * Process: instantiate provider with empty dir; call readFile on a non-existent uri; assert
   *   the thrown error is a FileSystemError with code FileNotFound.
   */
  test('readFile throws FileNotFound for missing files', () => {
    const dir = makeWorkingDir();
    try {
      const provider = new SpecFileSystemProvider(dir);
      const uri = vscode.Uri.parse(`${SPEC_SCHEME}:/missing.md`);
      assert.throws(
        () => provider.readFile(uri),
        (err: unknown) =>
          err instanceof vscode.FileSystemError && (err as vscode.FileSystemError).code === 'FileNotFound',
      );
    } finally {
      rmrf(dir);
    }
  });

  /**
   * Goal: `writeFile` writes bytes to the underlying real filesystem and creates parent dirs as
   *   needed. Pins that virtual writes pass through to the real spec dir.
   * Process: write to a nested path; assert the underlying file is created with the right content.
   */
  test('writeFile creates the file (and missing parent dirs) on the real filesystem', () => {
    const dir = makeWorkingDir();
    try {
      const provider = new SpecFileSystemProvider(dir);
      const uri = vscode.Uri.parse(`${SPEC_SCHEME}:/blueprint/auth/spec.md`);
      provider.writeFile(uri, Buffer.from('# Auth\n'), { create: true, overwrite: true });
      const realPath = path.join(dir, 'blueprint', 'auth', 'spec.md');
      assert.strictEqual(fs.readFileSync(realPath, 'utf8'), '# Auth\n');
    } finally {
      rmrf(dir);
    }
  });
});

suite('Integration: SpecFileSystemProvider — read-only gate', () => {
  /**
   * Goal: while the read-only flag is set (agent is editing), `writeFile` throws NoPermissions
   *   so the user can't accidentally write while the agent is mid-edit. Pins the only barrier
   *   between the user and a half-baked merge.
   * Process: instantiate; setReadOnly(true); attempt writeFile; assert NoPermissions error.
   */
  test('writeFile throws NoPermissions when read-only is set', () => {
    const dir = makeWorkingDir();
    try {
      const provider = new SpecFileSystemProvider(dir);
      provider.setReadOnly(true);
      const uri = vscode.Uri.parse(`${SPEC_SCHEME}:/spec.md`);
      assert.throws(
        () => provider.writeFile(uri, Buffer.from('x'), { create: true, overwrite: true }),
        (err: unknown) =>
          err instanceof vscode.FileSystemError && (err as vscode.FileSystemError).code === 'NoPermissions',
      );
    } finally {
      rmrf(dir);
    }
  });

  /**
   * Goal: `delete` and `rename` are also blocked while read-only. Pins symmetry with writeFile —
   *   any mutation must be blocked, not just content writes.
   * Process: create a file; setReadOnly(true); assert delete and rename both throw NoPermissions.
   */
  test('delete and rename also throw NoPermissions when read-only', () => {
    const dir = makeWorkingDir();
    try {
      fs.writeFileSync(path.join(dir, 'a.md'), 'x');
      const provider = new SpecFileSystemProvider(dir);
      provider.setReadOnly(true);
      const a = vscode.Uri.parse(`${SPEC_SCHEME}:/a.md`);
      const b = vscode.Uri.parse(`${SPEC_SCHEME}:/b.md`);
      assert.throws(
        () => provider.delete(a),
        (err: unknown) =>
          err instanceof vscode.FileSystemError && (err as vscode.FileSystemError).code === 'NoPermissions',
      );
      assert.throws(
        () => provider.rename(a, b, { overwrite: false }),
        (err: unknown) =>
          err instanceof vscode.FileSystemError && (err as vscode.FileSystemError).code === 'NoPermissions',
      );
    } finally {
      rmrf(dir);
    }
  });

  /**
   * Goal: `stat` reports the Readonly permission flag while read-only is set. Pins the signal
   *   VS Code uses to render the editor in read-only mode (greyed-out indicator + blocked
   *   keystrokes).
   * Process: create a file; instantiate; toggle readOnly; assert stat().permissions reflects the
   *   flag in both states.
   */
  test('stat reports Readonly permission while read-only is set', () => {
    const dir = makeWorkingDir();
    try {
      fs.writeFileSync(path.join(dir, 'a.md'), 'x');
      const provider = new SpecFileSystemProvider(dir);
      const uri = vscode.Uri.parse(`${SPEC_SCHEME}:/a.md`);
      assert.strictEqual(provider.stat(uri).permissions, undefined, 'writable when not read-only');
      provider.setReadOnly(true);
      assert.strictEqual(provider.stat(uri).permissions, vscode.FilePermission.Readonly);
    } finally {
      rmrf(dir);
    }
  });
});

suite('Integration: SpecFileSystemProvider — spec-URI tracking', () => {
  /**
   * Goal: `getSpecUri` returns null until `setSpecFile` is called, then returns a URI built from
   *   the relative path. Pins the contract used by `Editor` to know which file to open.
   * Process: instantiate; assert null; setSpecFile('blueprint/x/spec.md'); assert URI scheme +
   *   path; setSpecFile(null) clears it.
   */
  test('getSpecUri tracks setSpecFile state', () => {
    const dir = makeWorkingDir();
    try {
      const provider = new SpecFileSystemProvider(dir);
      assert.strictEqual(provider.getSpecUri(), null, 'no spec file initially');

      provider.setSpecFile('blueprint/x/spec.md');
      const uri = provider.getSpecUri()!;
      assert.strictEqual(uri.scheme, SPEC_SCHEME);
      assert.ok(uri.path.endsWith('/blueprint/x/spec.md'));

      provider.setSpecFile(null);
      assert.strictEqual(provider.getSpecUri(), null, 'cleared by setSpecFile(null)');
    } finally {
      rmrf(dir);
    }
  });

  /**
   * Goal: `notifyFileChanged` fires a `Changed` event for the current spec URI so VS Code
   *   reloads the document when the agent rewrites it. Pins the only path the editor uses to
   *   tell VS Code "this content is stale, re-read."
   * Process: subscribe to onDidChangeFile; setSpecFile; call notifyFileChanged; assert one
   *   Changed event arrives for the spec URI.
   */
  test('notifyFileChanged emits a Changed event for the current spec URI', () => {
    const dir = makeWorkingDir();
    try {
      const provider = new SpecFileSystemProvider(dir);
      provider.setSpecFile('spec.md');

      const events: vscode.FileChangeEvent[] = [];
      const sub = provider.onDidChangeFile((evts) => events.push(...evts));
      try {
        provider.notifyFileChanged();
      } finally {
        sub.dispose();
      }

      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].type, vscode.FileChangeType.Changed);
      assert.strictEqual(events[0].uri.toString(), provider.getSpecUri()!.toString());
    } finally {
      rmrf(dir);
    }
  });

  /**
   * Goal: `notifyFileChanged` is a no-op when no spec is set (so a stale tick during teardown
   *   doesn't fire spurious events). Pins the defensive guard.
   * Process: instantiate without setSpecFile; subscribe; call notifyFileChanged; assert no events.
   */
  test('notifyFileChanged is a no-op when no spec file is set', () => {
    const dir = makeWorkingDir();
    try {
      const provider = new SpecFileSystemProvider(dir);
      const events: vscode.FileChangeEvent[] = [];
      const sub = provider.onDidChangeFile((evts) => events.push(...evts));
      try {
        provider.notifyFileChanged();
      } finally {
        sub.dispose();
      }
      assert.strictEqual(events.length, 0);
    } finally {
      rmrf(dir);
    }
  });

  /**
   * Goal: `setReadOnly` fires a Changed event when toggling AND a spec is set, so VS Code
   *   re-reads stat() and reflects the new permission. No event when state didn't change. Pins
   *   the optimization that avoids spurious re-renders.
   * Process: set spec; subscribe; toggle to true (event); toggle true again (no event); toggle
   *   false (event); assert event count is 2.
   */
  test('setReadOnly fires a Changed event only on actual transitions', () => {
    const dir = makeWorkingDir();
    try {
      const provider = new SpecFileSystemProvider(dir);
      provider.setSpecFile('spec.md');
      const events: vscode.FileChangeEvent[] = [];
      const sub = provider.onDidChangeFile((evts) => events.push(...evts));
      try {
        provider.setReadOnly(true);
        provider.setReadOnly(true); // unchanged → no event
        provider.setReadOnly(false);
      } finally {
        sub.dispose();
      }
      assert.strictEqual(events.length, 2);
    } finally {
      rmrf(dir);
    }
  });
});

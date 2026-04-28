import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export const SPEC_SCHEME = 'blueprint-spec';

export class SpecFileSystemProvider implements vscode.FileSystemProvider {
  private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this._emitter.event;

  private workingDir: string;
  private _isReadOnly = false;
  private _currentSpecRelPath: string | null = null;

  constructor(workingDir: string) {
    this.workingDir = workingDir;
  }

  setReadOnly(readOnly: boolean): void {
    if (this._isReadOnly === readOnly) return;
    this._isReadOnly = readOnly;
    const specUri = this.getSpecUri();
    if (specUri) {
      this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri: specUri }]);
    }
  }

  setSpecFile(relPath: string | null): void {
    this._currentSpecRelPath = relPath;
  }

  getSpecUri(): vscode.Uri | null {
    if (!this._currentSpecRelPath) return null;
    return vscode.Uri.parse(`${SPEC_SCHEME}:/${this._currentSpecRelPath}`);
  }

  notifyFileChanged(): void {
    const specUri = this.getSpecUri();
    if (specUri) {
      this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri: specUri }]);
    }
  }

  private getRealPath(uri: vscode.Uri): string {
    return path.join(this.workingDir, uri.path);
  }

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    const realPath = this.getRealPath(uri);
    try {
      const stats = fs.statSync(realPath);
      return {
        type: stats.isDirectory() ? vscode.FileType.Directory : vscode.FileType.File,
        ctime: stats.ctimeMs,
        mtime: stats.mtimeMs,
        size: stats.size,
        permissions: this._isReadOnly ? vscode.FilePermission.Readonly : undefined,
      };
    } catch {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
  }

  readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
    const realPath = this.getRealPath(uri);
    const entries = fs.readdirSync(realPath, { withFileTypes: true });
    return entries.map((e) => [e.name, e.isDirectory() ? vscode.FileType.Directory : vscode.FileType.File]);
  }

  createDirectory(uri: vscode.Uri): void {
    fs.mkdirSync(this.getRealPath(uri), { recursive: true });
  }

  readFile(uri: vscode.Uri): Uint8Array {
    try {
      return fs.readFileSync(this.getRealPath(uri));
    } catch {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
  }

  writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean }): void {
    if (this._isReadOnly) throw vscode.FileSystemError.NoPermissions('File is read-only while agent is working');
    const realPath = this.getRealPath(uri);
    const exists = fs.existsSync(realPath);
    if (!exists && !options.create) throw vscode.FileSystemError.FileNotFound(uri);
    if (exists && !options.overwrite) throw vscode.FileSystemError.FileExists(uri);
    const dir = path.dirname(realPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(realPath, content);
    this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  delete(uri: vscode.Uri): void {
    if (this._isReadOnly) throw vscode.FileSystemError.NoPermissions('Read-only');
    fs.unlinkSync(this.getRealPath(uri));
    this._emitter.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
  }

  rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): void {
    if (this._isReadOnly) throw vscode.FileSystemError.NoPermissions('Read-only');
    const newPath = this.getRealPath(newUri);
    if (fs.existsSync(newPath) && !options.overwrite) throw vscode.FileSystemError.FileExists(newUri);
    fs.renameSync(this.getRealPath(oldUri), newPath);
    this._emitter.fire([
      { type: vscode.FileChangeType.Deleted, uri: oldUri },
      { type: vscode.FileChangeType.Created, uri: newUri },
    ]);
  }
}

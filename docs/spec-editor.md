# Plan Editor

The plan editor wraps plan files in a custom file system provider that supports toggleable read-only mode and dynamic plan-file paths.

## Architecture

`SpecFileSystemProvider` (`editor/specFilesystem.ts`) wraps the real file system for plan files, allowing:
- Dynamic plan file paths (e.g. `blueprint/auth-rbac/plan.md`)
- Read-only mode while the editor agent is working (prevents concurrent edits)
- Normal editing once the agent goes idle

## Custom Scheme

Files are accessed via the `blueprint-spec:` URI scheme:
- `blueprint-spec:/blueprint/auth-rbac/plan.md`

The provider maps this to the real file at `{workingDir}/blueprint/auth-rbac/plan.md`.

The scheme keeps the plan file out of the standard `file:` scheme so it can have its own permission model and so VS Code treats it as a non-workspace document for things like the comment controller.

## Dynamic Plan Paths

The provider tracks the current active plan file via `setSpecFile()`:

```typescript
specProvider.setSpecFile('blueprint/auth-rbac/plan.md');  // set active plan
specProvider.setSpecFile(null);                           // clear (no active plan)
specProvider.getSpecUri();                                // blueprint-spec:/... or null
```

## Read-Only Control

```typescript
specProvider.setReadOnly(true);   // lock during agent work
specProvider.setReadOnly(false);  // unlock after completion
```

When read-only:
- `stat()` returns `FilePermission.Readonly`
- `writeFile()`, `delete()`, and `rename()` throw `NoPermissions`
- VS Code shows the file as read-only in the editor

`Editor.update` toggles read-only based on `screen.editorAgent.working`.

## File Change Notifications

Call `notifyFileChanged()` after writing to the underlying file via Node's `fs` API to refresh the editor:

```typescript
fs.appendFileSync(specPath, newContent);
specProvider.notifyFileChanged();
```

## Integration with App

1. `WritingSpecState` calls `generateFeatureSlug()` to pick a feature directory name
2. The plan path is built from the selected template's `filename`: `blueprint/<feature>/<filename>`
3. `WritingSpecState` creates the directory and an empty file on disk
4. `Editor.update` sees the new `specFilePath` on `SpecEditingScreen`, calls `setSpecFile(...)` and opens the file via the custom URI
5. The writing agent streams text directly into the file; `notifyFileChanged()` refreshes the editor on each write
6. On reload / new plan, `Editor.clearAll` calls `setSpecFile(null)` — the file stays on disk

## Auto-save

`Editor` runs a 25 ms interval that saves the plan document if it's dirty. This avoids conflicts between user edits and agent writes — the agent always reads the latest disk state.

## File-change → state hook

`Editor` listens for `onDidChangeTextDocument` on the plan URI. Whenever the plan content changes (user edit or external write), it sends `specFileChanged` with the new content. `EditorReadyState.handleSpecFileChanged` clears stale pending feedback and removes plan questions whose anchors no longer resolve.

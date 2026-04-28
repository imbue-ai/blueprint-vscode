import { randomUUID } from 'crypto';
import * as vscode from 'vscode';

import type { ExtensionData } from '../types/data';
import type { SidebarOutMessage } from '../types/messages';
import { FeedbackThreadManager } from './feedbackThreads';
import { SPEC_SCHEME, SpecFileSystemProvider } from './specFilesystem';

export { SPEC_SCHEME };

export class Editor implements vscode.Disposable {
  private specProvider: SpecFileSystemProvider;
  private onAction: (action: SidebarOutMessage) => void;
  private disposables: vscode.Disposable[] = [];
  private lastSpecFilePath: string | null = null;
  private autosaveInterval: ReturnType<typeof setInterval>;

  private feedbackThreads: FeedbackThreadManager;

  private feedbackDecoration: vscode.TextEditorDecorationType;
  private lastFeedbackItemsJson: string = '';

  constructor(context: vscode.ExtensionContext, workingDir: string, onAction: (action: SidebarOutMessage) => void) {
    this.onAction = onAction;
    this.specProvider = new SpecFileSystemProvider(workingDir);

    this.disposables.push(
      vscode.workspace.registerFileSystemProvider(SPEC_SCHEME, this.specProvider, { isReadonly: false }),
    );

    const fController = vscode.comments.createCommentController('blueprint-feedback', 'Feedback');
    fController.options = { prompt: 'Add or edit feedback', placeHolder: 'Enter feedback text' };
    this.disposables.push(fController);
    this.feedbackThreads = new FeedbackThreadManager(fController);

    this.feedbackDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(0, 120, 215, 0.12)',
      isWholeLine: true,
    });
    this.disposables.push(this.feedbackDecoration);

    this.registerCommands();
    this.disposables.push(vscode.window.onDidChangeActiveTextEditor(() => this.updateDecorations()));

    // When the spec document changes (user edit or file reload), notify the App
    // so it can remove broken-anchor questions and stale feedback
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        const specUri = this.specProvider.getSpecUri();
        if (!specUri || e.document.uri.toString() !== specUri.toString()) return;
        const specContent = e.document.getText();
        this.updateDecorations();
        this.onAction({ type: 'specFileChanged', specContent });
      }),
    );

    // Autosave the spec document so unsaved edits don't conflict with agent writes
    this.autosaveInterval = setInterval(() => this.autosaveSpecDocument(), 25);
  }

  private registerCommands(): void {
    this.disposables.push(
      vscode.commands.registerCommand('blueprint.editFeedback', (reply: vscode.CommentReply) => {
        const text = reply.text.trim();
        if (!text) return;
        const id = this.feedbackThreads.findIdByThread(reply.thread);
        if (id) {
          this.onAction({ type: 'editFeedback', id, text });
        } else {
          // New feedback from "+" gutter button. Adopt the VSCode-created thread
          // before sending the message, so update() finds it already tracked.
          const newId = randomUUID();
          const startLine = reply.thread.range!.start.line + 1;
          const endLine = reply.thread.range!.end.line + 1;
          this.feedbackThreads.adoptThread(newId, reply.thread, text, startLine, endLine);
          this.onAction({ type: 'addFeedback', id: newId, text, startLine, endLine });
        }
      }),
      vscode.commands.registerCommand('blueprint.deleteFeedback', (thread: vscode.CommentThread) => {
        const id = this.feedbackThreads.findIdByThread(thread);
        if (id) {
          this.onAction({ type: 'deleteFeedback', id });
        } else {
          // Thread not yet tracked (created via "+" gutter but not submitted) — just dispose it
          thread.dispose();
        }
      }),
      vscode.commands.registerCommand('blueprint.addFeedbackFromSelection', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) return;
        const specUri = this.specProvider.getSpecUri();
        if (!specUri || editor.document.uri.toString() !== specUri.toString()) return;

        const range = new vscode.Range(editor.selection.start, editor.selection.end);
        this.feedbackThreads.createEmptyThread(specUri, range);
      }),
    );
  }

  update(data: ExtensionData): void {
    if (data.status === 'error') {
      this.clearAll();
      return;
    }

    const screen = data.screen;
    if (screen.type === 'specEditing') {
      const specFilePath = screen.specFilePath || null;
      this.specProvider.setSpecFile(specFilePath);
      this.specProvider.setReadOnly(screen.editorAgent.working);

      if (specFilePath !== this.lastSpecFilePath) {
        this.lastSpecFilePath = specFilePath;
        this.openSpec();
      }

      this.specProvider.notifyFileChanged();

      const feedbackJson = JSON.stringify(screen.feedbackItems);
      if (feedbackJson !== this.lastFeedbackItemsJson) {
        this.lastFeedbackItemsJson = feedbackJson;
        this.feedbackThreads.update(screen.feedbackItems, this.specProvider);
        this.feedbackThreads.refreshCommentingRangeProvider(this.specProvider);
      }
    } else {
      this.clearAll();
    }

    this.updateDecorations();
  }

  async openSpec(): Promise<void> {
    const specUri = this.specProvider.getSpecUri();
    if (!specUri) return;
    vscode.workspace.openTextDocument(specUri).then(
      (doc) => vscode.window.showTextDocument(doc, { preview: false }),
      () => {
        /* File may not exist yet */
      },
    );
  }

  private autosaveSpecDocument(): void {
    const specUri = this.specProvider.getSpecUri();
    if (!specUri) return;
    const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === specUri.toString());
    if (doc?.isDirty) doc.save();
  }

  private updateDecorations(): void {
    const specUri = this.specProvider.getSpecUri();
    if (!specUri) return;
    const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === specUri.toString());
    if (!editor) return;

    editor.setDecorations(this.feedbackDecoration, this.feedbackThreads.getDecorations());
  }

  private clearAll(): void {
    this.feedbackThreads.clear();
    this.specProvider.setSpecFile(null);
    this.specProvider.setReadOnly(false);
    this.lastSpecFilePath = null;
  }

  dispose(): void {
    clearInterval(this.autosaveInterval);
    this.clearAll();
    for (const d of this.disposables) d.dispose();
  }
}

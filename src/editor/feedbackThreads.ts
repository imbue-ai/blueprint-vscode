import * as vscode from 'vscode';

import type { FeedbackItem } from '../types/screens';
import type { SpecFileSystemProvider } from './specFilesystem';

class FeedbackComment implements vscode.Comment {
  constructor(
    public body: string | vscode.MarkdownString,
    public mode: vscode.CommentMode,
    public author: vscode.CommentAuthorInformation,
    public contextValue?: string,
  ) {}
}

export class FeedbackThreadManager {
  private threads = new Map<string, vscode.CommentThread>();
  private controller: vscode.CommentController;

  constructor(controller: vscode.CommentController) {
    this.controller = controller;
  }

  update(items: FeedbackItem[], specProvider: SpecFileSystemProvider): void {
    const currentIds = new Set(items.map((f) => f.id));

    for (const [id, thread] of this.threads) {
      if (!currentIds.has(id)) {
        thread.dispose();
        this.threads.delete(id);
      }
    }

    const specUri = specProvider.getSpecUri();
    if (!specUri) return;

    for (const item of items) {
      const existing = this.threads.get(item.id);
      if (existing) {
        const currentComment = existing.comments[0];
        if (currentComment && currentComment.body !== item.text) {
          existing.comments = [
            new FeedbackComment(item.text, vscode.CommentMode.Preview, { name: 'Feedback' }, 'canEdit'),
          ];
        }
        existing.label =
          item.startLine === item.endLine
            ? `Feedback (Line ${item.startLine})`
            : `Feedback (Lines ${item.startLine}-${item.endLine})`;
        continue;
      }

      const line = Math.max(item.startLine - 1, 0);
      const thread = this.controller.createCommentThread(specUri, new vscode.Range(line, 0, line, 0), []);
      thread.comments = [new FeedbackComment(item.text, vscode.CommentMode.Preview, { name: 'Feedback' }, 'canEdit')];
      thread.label =
        item.startLine === item.endLine
          ? `Feedback (Line ${item.startLine})`
          : `Feedback (Lines ${item.startLine}-${item.endLine})`;
      thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
      thread.contextValue = 'feedback';
      this.threads.set(item.id, thread);
    }
  }

  // Adopt a VSCode-created thread (from the "+" gutter button) as a tracked feedback thread.
  // Must be called before the broadcast triggers update(), so update() finds it already tracked.
  adoptThread(id: string, thread: vscode.CommentThread, text: string, startLine: number, endLine: number): void {
    thread.comments = [new FeedbackComment(text, vscode.CommentMode.Preview, { name: 'Feedback' }, 'canEdit')];
    thread.label = startLine === endLine ? `Feedback (Line ${startLine})` : `Feedback (Lines ${startLine}-${endLine})`;
    thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
    thread.contextValue = 'feedback';
    this.threads.set(id, thread);
  }

  // Create an empty thread at the given range so the user can type feedback inline.
  // Not tracked yet — when the user submits, editFeedback will adopt it.
  createEmptyThread(uri: vscode.Uri, range: vscode.Range): void {
    const thread = this.controller.createCommentThread(uri, range, []);
    thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
    thread.contextValue = 'feedback';
  }

  findIdByThread(thread: vscode.CommentThread): string | null {
    for (const [id, t] of this.threads) {
      if (t === thread) return id;
    }
    return null;
  }

  getDecorations(): vscode.DecorationOptions[] {
    const result: vscode.DecorationOptions[] = [];
    for (const thread of this.threads.values()) {
      if (thread.range) result.push({ range: thread.range });
    }
    return result;
  }

  refreshCommentingRangeProvider(specProvider: SpecFileSystemProvider): void {
    this.controller.commentingRangeProvider = {
      provideCommentingRanges: (doc: vscode.TextDocument) => {
        const specUri = specProvider.getSpecUri();
        if (!specUri || doc.uri.toString() !== specUri.toString()) return [];
        return [new vscode.Range(0, 0, Math.max(doc.lineCount - 1, 0), 0)];
      },
    };
  }

  clear(): void {
    for (const thread of this.threads.values()) thread.dispose();
    this.threads.clear();
  }
}

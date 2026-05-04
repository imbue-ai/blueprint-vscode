import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { SPEC_SCHEME } from '../../editor/editor';
import type { QuestionRound, StreamItem } from '../../types/screens';
import { findAnchorLine } from '../../utils/anchorUtils';
import { formatQAPairs } from '../../utils/questionUtils';
import { createToolCallStreamItem } from '../../utils/toolUse';
import type { App, AppContext } from '../app';
import { getSpecRefinePrompt } from '../prompts';
import { continueAgenticQuestions, startAgenticQuestions } from '../questionGeneration';
import { type ClaudeSession, isRateLimitError } from '../session';
import type { SnapshotManager } from '../snapshotManager';
import { EditingState } from '../states/editing';

export interface PanelState {
  panelCollapsed: boolean;
  questionGenerating: boolean;
  questioningToolCalls: Array<Extract<StreamItem, { type: 'tool_call' }>>;
  abortSignal: { aborted: boolean };
}

export function handleAnswerPanelQuestion(
  snapshotManager: SnapshotManager,
  app: App,
  anchor: string,
  textAnswer: string,
  chosenIndices: number[],
): void {
  const snap = snapshotManager.getCurrentSnapshot();
  if (!snap) return;
  for (const round of snap.questionRounds) {
    if (round.frozen) continue;
    const q = round.questions.find((q) => q.anchor === anchor);
    if (!q) continue;
    q.textAnswer = textAnswer;
    q.chosenIndices = chosenIndices;
    app.broadcast();
    return;
  }
}

export function handleSubmitPanelAnswers(
  ctx: AppContext,
  specFilePath: string,
  snapshotManager: SnapshotManager,
  editingSession: ClaudeSession,
  questionsSession: ClaudeSession | null,
  app: App,
  panelState: PanelState,
): void {
  if (panelState.questionGenerating) return;
  const snap = snapshotManager.getCurrentSnapshot();
  if (!snap) return;
  const rounds = snap.questionRounds;
  const activeRound = rounds[rounds.length - 1];
  if (!activeRound || activeRound.frozen) return;

  const qaPairs = formatQAPairs(activeRound.questions);

  if (!qaPairs) return;

  const frozenRounds = rounds.map((r, i) => (i === rounds.length - 1 ? { ...r, frozen: true } : r));
  snapshotManager.updateCurrentSnapshot({ questionRounds: frozenRounds });

  const text = getSpecRefinePrompt(qaPairs);
  app.setState(
    new EditingState(ctx, specFilePath, snapshotManager, editingSession, text, questionsSession, true, false),
  );
}

export function handleRefreshQuestions(
  panelState: PanelState,
  snapshotManager: SnapshotManager,
  questionsSession: ClaudeSession | null,
  ctx: AppContext,
  specFilePath: string,
  app: App,
): void {
  if (panelState.questionGenerating || !questionsSession) return;
  const snap = snapshotManager.getCurrentSnapshot();
  if (!snap) return;

  const rounds = snap.questionRounds;
  if (rounds.length > 0 && !rounds[rounds.length - 1].frozen) {
    const frozenRounds = rounds.map((r, i) => (i === rounds.length - 1 ? { ...r, frozen: true } : r));
    snapshotManager.updateCurrentSnapshot({ questionRounds: frozenRounds });
  }

  refreshQuestions(panelState, snapshotManager, questionsSession, specFilePath, app).catch((err) => {
    if (isRateLimitError(err)) {
      app.onRateLimit(err.resetsAt);
      return;
    }
    console.error('[panelQuestionHandlers] refreshQuestions error:', err);
  });
}

async function refreshQuestions(
  panelState: PanelState,
  snapshotManager: SnapshotManager,
  questionsSession: ClaudeSession,
  specFilePath: string,
  app: App,
): Promise<void> {
  await runBackgroundGeneration(
    panelState,
    snapshotManager,
    questionsSession,
    specFilePath,
    app,
    'The user wants to see more questions. Re-read the spec and generate additional questions.',
  );
}

/**
 * Runs question generation in the background, updating panelState and committing
 * results to the snapshot on success. Used for initial generation, post-edit
 * regeneration, and user-initiated refresh.
 *
 * @param prompt - The prompt for continueAgenticQuestions. Pass null to use
 *   startAgenticQuestions (initial generation).
 */
export async function runBackgroundGeneration(
  panelState: PanelState,
  snapshotManager: SnapshotManager,
  questionsSession: ClaudeSession,
  specFilePath: string,
  app: App,
  prompt: string | null,
): Promise<void> {
  panelState.questionGenerating = true;
  panelState.questioningToolCalls = [];
  panelState.abortSignal = { aborted: false };
  app.broadcast();

  const onToolUse = (name: string, input: Record<string, unknown>) => {
    const item = createToolCallStreamItem(name, input);
    if (item) {
      panelState.questioningToolCalls = [...panelState.questioningToolCalls, item];
      app.broadcast();
    }
  };

  const result =
    prompt === null
      ? await startAgenticQuestions(
          questionsSession,
          specFilePath,
          () => app.broadcast(),
          panelState.abortSignal,
          onToolUse,
        )
      : await continueAgenticQuestions(
          questionsSession,
          prompt,
          specFilePath,
          () => app.broadcast(),
          panelState.abortSignal,
          onToolUse,
        );

  if (result.aborted) return;

  panelState.questionGenerating = false;
  panelState.questioningToolCalls = [];
  if (result.questions.length > 0) {
    const currentSnap = snapshotManager.getCurrentSnapshot();
    if (currentSnap) {
      snapshotManager.updateCurrentSnapshot({
        questionRounds: [...currentSnap.questionRounds, { questions: result.questions, frozen: false }],
      });
    }
  }
  app.broadcast();
}

export function buildQuestionsPanelRounds(specContent: string, questionRounds: QuestionRound[]): QuestionRound[] {
  return questionRounds.map((round) => ({
    ...round,
    questions: round.questions
      .map((q) => {
        const line = findAnchorLine(specContent, q.anchor);
        q.line = line >= 0 ? line : undefined;
        return q;
      })
      .filter((q) => round.frozen || q.line != null)
      .sort((a, b) => (a.line ?? Infinity) - (b.line ?? Infinity)),
  }));
}

let highlightTimeout: ReturnType<typeof setTimeout> | null = null;
let activeHighlight: vscode.TextEditorDecorationType | null = null;

export function handleJumpToLine(ctx: AppContext, specFilePath: string, anchor: string): void {
  const specAbsPath = path.join(ctx.workingDir, specFilePath);
  if (!fs.existsSync(specAbsPath)) return;
  const content = fs.readFileSync(specAbsPath, 'utf-8');
  const line = findAnchorLine(content, anchor);
  if (line === -1) return;
  revealAndFlash(specFilePath, line);
}

export function handleJumpToLineNumber(ctx: AppContext, specFilePath: string, line: number): void {
  const specAbsPath = path.join(ctx.workingDir, specFilePath);
  if (!fs.existsSync(specAbsPath)) return;
  revealAndFlash(specFilePath, line - 1);
}

function revealAndFlash(specRelPath: string, line: number): void {
  const uri = vscode.Uri.parse(`${SPEC_SCHEME}:/${specRelPath}`);
  vscode.window.showTextDocument(uri, { preview: false }).then((editor) => {
    const range = new vscode.Range(line, 0, line, 0);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    editor.selection = new vscode.Selection(line, 0, line, 0);
    flashLineHighlight(editor, line);
  });
}

function flashLineHighlight(editor: vscode.TextEditor, line: number): void {
  if (highlightTimeout) clearTimeout(highlightTimeout);
  if (activeHighlight) activeHighlight.dispose();

  const decoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(130, 180, 255, 0.35)',
    isWholeLine: true,
  });
  activeHighlight = decoration;
  editor.setDecorations(decoration, [{ range: new vscode.Range(line, 0, line, 0) }]);

  highlightTimeout = setTimeout(() => {
    decoration.dispose();
    activeHighlight = null;
    highlightTimeout = null;
  }, 1200);
}

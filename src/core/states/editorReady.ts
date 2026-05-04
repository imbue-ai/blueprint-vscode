import * as fs from 'fs';
import * as path from 'path';

import type { SidebarOutMessage } from '../../types/messages';
import type { AgentStatus, AppScreen, FeedbackItem, QuestionRound } from '../../types/screens';
import { findAnchorLine } from '../../utils/anchorUtils';
import { formatQAPairs } from '../../utils/questionUtils';
import type { App, AppContext, AppState } from '../app';
import { buildFeedbackPrompt } from '../feedbackSubmit';
import type { ClaudeSession } from '../session';
import { isRateLimitError } from '../session';
import type { SnapshotManager } from '../snapshotManager';
import {
  buildQuestionsPanelRounds,
  handleAnswerPanelQuestion,
  handleJumpToLine,
  handleJumpToLineNumber,
  handleRefreshQuestions,
  handleSubmitPanelAnswers,
  type PanelState,
  runBackgroundGeneration,
} from '../utils/panelQuestionHandlers';
import { computeQuestionsAgent } from '../utils/questionsAgent';
import { EditingState } from './editing';

export type BackgroundGeneration = 'initial' | 'continue' | 'none';

export class EditorReadyState implements AppState {
  private readonly ctx: AppContext;
  private readonly specFilePath: string;
  private snapshotManager: SnapshotManager;
  private editingSession: ClaudeSession;
  private questionsSession: ClaudeSession | null;
  private messageDraft: string = '';
  // TODO: questionGenerating starts false, but when backgroundGeneration !== 'none'
  // onEnter synchronously flips it to true via runBackgroundGeneration. The setState
  // in the transition broadcasts before onEnter runs, so the first frame can render
  // questionsAgent.phase='ready' ("Ready", no pulsing dot) before the second broadcast
  // shows "Generating...". React usually batches the two, but ordering isn't guaranteed
  // and the flash is visible on slower frames. Fix: seed questionGenerating=true in the
  // constructor when backgroundGeneration !== 'none' (same pattern as the fix for
  // GeneratingPromptQuestionsState).
  private panelState: PanelState = {
    panelCollapsed: false,
    questionGenerating: false,
    questioningToolCalls: [],
    abortSignal: { aborted: false },
  };

  private readonly backgroundGeneration: BackgroundGeneration;

  constructor(
    ctx: AppContext,
    specFilePath: string,
    snapshotManager: SnapshotManager,
    editingSession: ClaudeSession,
    messageDraft: string = '',
    questionsSession: ClaudeSession | null = null,
    backgroundGeneration: BackgroundGeneration = 'none',
  ) {
    this.ctx = ctx;
    this.specFilePath = specFilePath;
    this.snapshotManager = snapshotManager;
    this.editingSession = editingSession;
    this.questionsSession = questionsSession;
    this.messageDraft = messageDraft;
    this.backgroundGeneration = backgroundGeneration;
  }

  onEnter(app: App): void {
    if (this.backgroundGeneration !== 'none' && this.questionsSession) {
      this.startBackgroundQuestionGeneration(app);
    }
  }

  onRestore(): void {
    const snap = this.snapshotManager.getCurrentSnapshot();
    if (!snap) return;
    const specAbsPath = path.join(this.ctx.workingDir, this.specFilePath);
    fs.writeFileSync(specAbsPath, snap.specContent);

    this.panelState.questionGenerating = false;
    this.panelState.questioningToolCalls = [];
    this.panelState.abortSignal = { aborted: false };
  }

  private startBackgroundQuestionGeneration(app: App): void {
    if (!this.questionsSession || this.panelState.questionGenerating) return;

    const prompt = this.backgroundGeneration === 'initial' ? null : this.buildContinuePrompt();

    runBackgroundGeneration(
      this.panelState,
      this.snapshotManager,
      this.questionsSession,
      this.specFilePath,
      app,
      prompt,
    ).catch((err) => {
      if (isRateLimitError(err)) {
        app.onRateLimit(err.resetsAt);
        return;
      }
      console.error('[EditorReadyState] background question generation error:', err);
    });
  }

  private buildContinuePrompt(): string {
    const snap = this.snapshotManager.getCurrentSnapshot();
    const frozenRounds = snap?.questionRounds.filter((r) => r.frozen) ?? [];
    const lastFrozen = frozenRounds[frozenRounds.length - 1];
    const qaPairs = lastFrozen ? formatQAPairs(lastFrozen.questions) : '';
    return qaPairs || 'The spec has been updated. Generate follow-up questions.';
  }

  handleMessage(app: App, message: SidebarOutMessage): void {
    switch (message.type) {
      case 'setDraftMessage':
        this.messageDraft = message.message;
        app.broadcast();
        return;
      case 'sendMessage':
        if (!this.messageDraft.trim()) return;
        this.transitionToEditing(app, this.messageDraft, false);
        this.messageDraft = '';
        return;
      case 'submitSpecFeedback': {
        const text = buildFeedbackPrompt(this.snapshotManager);
        if (!text) return;
        this.transitionToEditing(app, text, true);
        return;
      }
      case 'addFeedback': {
        const snap = this.snapshotManager.getCurrentSnapshot();
        if (!snap) return;
        const item: FeedbackItem = {
          id: message.id,
          text: message.text,
          startLine: message.startLine,
          endLine: message.endLine,
        };
        this.snapshotManager.updateCurrentSnapshot({ pendingFeedback: [...snap.pendingFeedback, item] });
        app.broadcast();
        return;
      }
      case 'editFeedback': {
        const snap = this.snapshotManager.getCurrentSnapshot();
        if (!snap) return;
        this.snapshotManager.updateCurrentSnapshot({
          pendingFeedback: snap.pendingFeedback.map((f) => (f.id === message.id ? { ...f, text: message.text } : f)),
        });
        app.broadcast();
        return;
      }
      case 'deleteFeedback': {
        const snap = this.snapshotManager.getCurrentSnapshot();
        if (!snap) return;
        this.snapshotManager.updateCurrentSnapshot({
          pendingFeedback: snap.pendingFeedback.filter((f) => f.id !== message.id),
        });
        app.broadcast();
        return;
      }
      case 'specFileChanged':
        this.handleSpecFileChanged(app, message.specContent);
        return;
      case 'answerPanelQuestion':
        handleAnswerPanelQuestion(this.snapshotManager, app, message.anchor, message.textAnswer, message.chosenIndices);
        return;
      case 'submitPanelAnswers':
        handleSubmitPanelAnswers(
          this.ctx,
          this.specFilePath,
          this.snapshotManager,
          this.editingSession,
          this.questionsSession,
          app,
          this.panelState,
        );
        return;
      case 'refreshPanelQuestions':
        handleRefreshQuestions(
          this.panelState,
          this.snapshotManager,
          this.questionsSession,
          this.ctx,
          this.specFilePath,
          app,
        );
        return;
      case 'toggleQuestionsPanel':
        this.panelState.panelCollapsed = !this.panelState.panelCollapsed;
        app.broadcast();
        return;
      case 'jumpToLine':
        handleJumpToLine(this.ctx, this.specFilePath, message.anchor);
        return;
      case 'jumpToLineNumber':
        handleJumpToLineNumber(this.ctx, this.specFilePath, message.line);
        return;
    }
  }

  // TODO: any external edit to the spec file wipes ALL pendingFeedback, even a
  // one-character keystroke far from any feedback anchor. User flow: add 5
  // feedback items, type a single char in the plan in VS Code → all 5 vanish
  // silently with no undo. Fix: re-anchor feedback by line range like
  // filterValidQuestionRounds does for questions, and only drop items whose
  // anchor is gone, instead of clearing the whole list.
  private handleSpecFileChanged(app: App, specContent: string): void {
    const snap = this.snapshotManager.getCurrentSnapshot();
    if (!snap) return;

    const hadFeedback = snap.pendingFeedback.length > 0;

    const validatedRounds = filterValidQuestionRounds(specContent, snap.questionRounds);
    const roundsChanged =
      validatedRounds.length !== snap.questionRounds.length ||
      validatedRounds.some((r, i) => r.questions.length !== snap.questionRounds[i].questions.length);

    this.snapshotManager.updateCurrentSnapshot({
      specContent,
      questionRounds: validatedRounds,
      ...(hadFeedback ? { pendingFeedback: [] } : {}),
    });

    if (roundsChanged || hadFeedback) app.broadcast();
  }

  private transitionToEditing(app: App, text: string, consumeFeedback: boolean): void {
    const backgroundRegenOnComplete = this.panelState.questionGenerating;
    this.panelState.abortSignal.aborted = true;
    app.setState(
      new EditingState(
        this.ctx,
        this.specFilePath,
        this.snapshotManager.clone(),
        this.editingSession.fork('Editing'),
        text,
        this.questionsSession?.fork('Editor questions') ?? null,
        backgroundRegenOnComplete,
        consumeFeedback,
      ),
    );
  }

  interrupt(): void {
    this.panelState.abortSignal.aborted = true;
    this.editingSession.abort();
    this.questionsSession?.abort();
  }

  isInteractive(): boolean {
    return true;
  }

  getScreen(): AppScreen {
    const snap = this.snapshotManager.getCurrentSnapshot();
    const feedbackItems = snap?.pendingFeedback ?? [];
    const editorAgent: AgentStatus = { working: false, phase: 'ready' };
    const questionsPanel = {
      rounds: buildQuestionsPanelRounds(snap?.specContent ?? '', snap?.questionRounds ?? []),
      loading: this.panelState.questionGenerating,
      toolCalls: this.panelState.questioningToolCalls,
      collapsed: this.panelState.panelCollapsed,
      willRegenerate: false,
    };

    return {
      type: 'specEditing',
      specFilePath: this.specFilePath,
      prompt: snap?.prompt ?? '',
      streamItems: snap?.streamItems ?? [],
      messageDraft: this.messageDraft,
      feedbackItems,
      nFeedback: feedbackItems.length,
      editorAgent,
      questionsAgent: computeQuestionsAgent(questionsPanel, editorAgent),
      sessionId: this.editingSession.getSessionId() ?? undefined,
      questionsPanel,
    };
  }
}

export function filterValidQuestionRounds(specContent: string, rounds: QuestionRound[]): QuestionRound[] {
  return rounds
    .map((round) => ({
      ...round,
      questions: round.frozen
        ? round.questions
        : round.questions.filter((q) => findAnchorLine(specContent, q.anchor) !== -1),
    }))
    .filter((round) => round.questions.length > 0);
}

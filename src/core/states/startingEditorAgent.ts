import type { SidebarOutMessage } from '../../types/messages';
import type { AppScreen, FeedbackItem, StreamItem } from '../../types/screens';
import { cleanupSpecTemplateFile, writeSpecTemplateFile } from '../../utils/specTemplate';
import { createToolCallStreamItem, extractToolUseFromContent } from '../../utils/toolUse';
import type { App, AppContext, AppState } from '../app';
import { getEditingPrompt } from '../prompts';
import { type ClaudeSession, isRateLimitError } from '../session';
import { SnapshotManager } from '../snapshotManager';
import { getSpecEditingSystemPrompt } from '../systemPrompts';
import { handleJumpToLineNumber } from '../utils/panelQuestionHandlers';
import { EditorReadyState } from './editorReady';

export class StartingEditorAgentState implements AppState {
  private readonly ctx: AppContext;
  private readonly specFilePath: string;
  private readonly specContent: string;
  private readonly prompt: string;
  private readonly specTemplate: string | undefined;
  private editingSession: ClaudeSession | null = null;
  private questionsSession: ClaudeSession | null = null;
  private interrupted = false;
  private readonly warmedUpSession: ClaudeSession | null;
  private streamItems: StreamItem[];
  private messageDraft: string = '';
  private pendingFeedback: FeedbackItem[];
  private specTemplatePath: string | null = null;

  constructor(
    ctx: AppContext,
    specFilePath: string,
    specContent: string,
    prompt: string,
    specTemplate?: string,
    warmedUpSession?: ClaudeSession | null,
    pendingFeedback: FeedbackItem[] = [],
    streamItems: StreamItem[] = [],
    messageDraft: string = '',
  ) {
    this.ctx = ctx;
    this.specFilePath = specFilePath;
    this.specContent = specContent;
    this.prompt = prompt;
    this.specTemplate = specTemplate;
    this.warmedUpSession = warmedUpSession ?? null;
    this.pendingFeedback = pendingFeedback;
    this.streamItems = streamItems;
    this.messageDraft = messageDraft;
  }

  onEnter(app: App): void {
    this.startEditor(app);
  }

  private async startEditor(app: App): Promise<void> {
    this.editingSession = this.warmedUpSession
      ? this.warmedUpSession.fork('Editor agent')
      : this.ctx.createSession('Editor agent');

    try {
      if (this.specTemplate) {
        this.specTemplatePath = writeSpecTemplateFile(this.specTemplate);
      }

      // Always warm up — the warmedUpSession comes from the prompt-questions
      // phase, not the writing phase, so it has never read the spec file.
      const editingPrompt = getEditingPrompt(this.specFilePath, this.specTemplatePath);

      for await (const message of this.editingSession.prompt(editingPrompt, {
        systemPrompt: getSpecEditingSystemPrompt(this.specFilePath),
        allowedTools: ['Read', 'Glob', 'Grep'],
      })) {
        if (this.interrupted) return;
        if (message.type === 'assistant') {
          const content = message.message?.content;
          if (Array.isArray(content)) {
            const toolUse = extractToolUseFromContent(content);
            if (toolUse) {
              const item = createToolCallStreamItem(toolUse.name, toolUse.input);
              if (item) {
                this.streamItems = [...this.streamItems, item];
              }
              app.broadcast();
            }
          }
        }
      }
      if (this.interrupted) return;

      // Create questions session; generation runs in the background after transition
      const questionsSession = this.ctx.createSession('Editor questions');
      this.questionsSession = questionsSession;

      this.cleanupSpecTemplate();

      // Create snapshot manager with initial snapshot
      const snapshotManager = new SnapshotManager();
      snapshotManager.createSnapshot({
        prompt: this.prompt,
        specContent: this.specContent,
        chatMessages: [],
        streamItems: this.streamItems,
        editingSession: this.editingSession,
        submittedFeedback: [],
        pendingFeedback: this.pendingFeedback,
        questionRounds: [],
      });

      app.setState(
        new EditorReadyState(
          this.ctx,
          this.specFilePath,
          snapshotManager,
          this.editingSession,
          this.messageDraft,
          questionsSession,
          'initial',
        ),
      );
    } catch (error) {
      if (isRateLimitError(error)) {
        app.onRateLimit(error.resetsAt);
        return;
      }
      console.error('Editor startup failed:', error);
    }
  }

  private cleanupSpecTemplate(): void {
    cleanupSpecTemplateFile(this.specTemplatePath);
    this.specTemplatePath = null;
  }

  handleMessage(app: App, message: SidebarOutMessage): void {
    switch (message.type) {
      case 'setDraftMessage':
        this.messageDraft = message.message;
        app.broadcast();
        return;
      case 'addFeedback':
        this.pendingFeedback = [
          ...this.pendingFeedback,
          { id: message.id, text: message.text, startLine: message.startLine, endLine: message.endLine },
        ];
        app.broadcast();
        return;
      case 'editFeedback':
        this.pendingFeedback = this.pendingFeedback.map((f) =>
          f.id === message.id ? { ...f, text: message.text } : f,
        );
        app.broadcast();
        return;
      case 'deleteFeedback':
        this.pendingFeedback = this.pendingFeedback.filter((f) => f.id !== message.id);
        app.broadcast();
        return;
      case 'jumpToLineNumber':
        handleJumpToLineNumber(this.ctx, this.specFilePath, message.line);
        return;
    }
  }

  interrupt(): void {
    this.interrupted = true;
    this.editingSession?.abort();
    this.questionsSession?.abort();
    this.cleanupSpecTemplate();
  }

  isInteractive(): boolean {
    return false;
  }

  getScreen(): AppScreen {
    return {
      type: 'specEditing',
      specFilePath: this.specFilePath,
      prompt: this.prompt,
      streamItems: this.streamItems,
      messageDraft: this.messageDraft,
      feedbackItems: this.pendingFeedback,
      nFeedback: this.pendingFeedback.length,
      // Editor is reading the plan + scoping the codebase. Questions agent
      // hasn't started (its session is created at the end of this state); show
      // a tab-specific label so the user understands the questions tab is
      // waiting on the editor to finish its review pass.
      editorAgent: { working: true, phase: 'reviewing_plan' },
      questionsAgent: { working: true, phase: 'waiting_for_plan_review' },
    };
  }
}

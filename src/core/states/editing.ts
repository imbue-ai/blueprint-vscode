import * as fs from 'fs';
import * as path from 'path';

import type { SidebarOutMessage } from '../../types/messages';
import type { AgentStatus, AppScreen, FeedbackItem } from '../../types/screens';
import { createToolCallStreamItem, extractToolUseFromContent } from '../../utils/toolUse';
import type { App, AppContext, AppState } from '../app';
import type { ClaudeSession } from '../session';
import { RateLimitError } from '../session';
import type { SnapshotManager } from '../snapshotManager';
import { getSpecEditingSystemPrompt } from '../systemPrompts';
import { buildQuestionsPanelRounds } from '../utils/panelQuestionHandlers';
import { computeQuestionsAgent } from '../utils/questionsAgent';
import { EditorReadyState, filterValidQuestionRounds } from './editorReady';

export class EditingState implements AppState {
  private readonly ctx: AppContext;
  private readonly specFilePath: string;
  private snapshotManager: SnapshotManager;
  private editingSession: ClaudeSession;
  private questionsSession: ClaudeSession | null;
  private forkedSession: ClaudeSession | null = null;
  private interrupted = false;
  private readonly messageText: string;
  private messageDraft: string = '';
  private panelCollapsed = false;
  private hasEditedSpec = false;
  private readonly backgroundRegenOnComplete: boolean;
  private readonly consumeFeedback: boolean;

  constructor(
    ctx: AppContext,
    specFilePath: string,
    snapshotManager: SnapshotManager,
    editingSession: ClaudeSession,
    messageText: string,
    questionsSession: ClaudeSession | null = null,
    backgroundRegenOnComplete: boolean = false,
    consumeFeedback: boolean = false,
  ) {
    this.ctx = ctx;
    this.specFilePath = specFilePath;
    this.snapshotManager = snapshotManager;
    this.editingSession = editingSession;
    this.questionsSession = questionsSession;
    this.messageText = messageText;
    this.backgroundRegenOnComplete = backgroundRegenOnComplete;
    this.consumeFeedback = consumeFeedback;
  }

  onEnter(app: App): void {
    this.sendMessage(this.messageText, app);
  }

  private async sendMessage(text: string, app: App): Promise<void> {
    const snapshot = this.snapshotManager.getCurrentSnapshot();
    if (!snapshot) return;

    const specAbsPath = path.join(this.ctx.workingDir, this.specFilePath);
    const specContent = fs.existsSync(specAbsPath) ? fs.readFileSync(specAbsPath, 'utf-8') : '';

    // Always create a new snapshot for the going-forward state.
    // The current snapshot is left untouched — it preserves the original
    // questions, feedback, and spec content for history/navigation.
    const forkedSession = snapshot.editingSession.fork('Editing');
    this.forkedSession = forkedSession;

    this.snapshotManager.createSnapshot({
      editingSession: forkedSession,
      specContent,
      chatMessages: [...snapshot.chatMessages, { role: 'user', content: text }],
      streamItems: [...snapshot.streamItems, { type: 'user_message', content: text }],
      prompt: snapshot.prompt,
      submittedFeedback: this.consumeFeedback
        ? [...snapshot.submittedFeedback, ...snapshot.pendingFeedback]
        : [...snapshot.submittedFeedback],
      pendingFeedback: this.consumeFeedback ? [] : [...snapshot.pendingFeedback],
      questionRounds: [...snapshot.questionRounds],
    });
    app.broadcast();

    try {
      await this.streamEditing(forkedSession, text, app);

      if (this.interrupted) return;

      // Update spec content and remove questions with broken anchors
      if (fs.existsSync(specAbsPath)) {
        const newContent = fs.readFileSync(specAbsPath, 'utf-8');
        const snap = this.snapshotManager.getCurrentSnapshot();
        const validatedRounds = filterValidQuestionRounds(newContent, snap?.questionRounds ?? []);
        this.snapshotManager.updateCurrentSnapshot({
          specContent: newContent,
          questionRounds: validatedRounds,
        });
      }

      const backgroundGen = this.backgroundRegenOnComplete ? ('continue' as const) : ('none' as const);

      app.setState(
        new EditorReadyState(
          this.ctx,
          this.specFilePath,
          this.snapshotManager.clone(),
          forkedSession,
          this.messageDraft,
          this.questionsSession?.fork('Editor questions') ?? null,
          backgroundGen,
        ),
      );
    } catch (error) {
      if (error instanceof RateLimitError) {
        app.onRateLimit(error.resetsAt);
        return;
      }
      console.error('Chat message failed:', error);
      if (this.interrupted) return;
      app.setState(
        new EditorReadyState(
          this.ctx,
          this.specFilePath,
          this.snapshotManager.clone(),
          this.editingSession.fork('Editing'),
          this.messageDraft,
          this.questionsSession?.fork('Editor questions') ?? null,
        ),
      );
    }
  }

  private async streamEditing(session: ClaudeSession, text: string, app: App): Promise<void> {
    for await (const message of session.prompt(text, {
      systemPrompt: getSpecEditingSystemPrompt(this.specFilePath),
      allowedTools: ['Read', 'Edit', 'Write'],
      includePartialMessages: true,
    })) {
      if (this.interrupted) return;
      const currentSnapshot = this.snapshotManager.getCurrentSnapshot()!;
      const chatMessages = currentSnapshot.chatMessages;

      if (message.type === 'assistant') {
        const content = message.message?.content;
        if (Array.isArray(content)) {
          const toolUse = extractToolUseFromContent(content);
          if (toolUse) {
            if (!this.hasEditedSpec && (toolUse.name === 'Edit' || toolUse.name === 'Write')) {
              this.hasEditedSpec = true;
            }
            // Push tool call to stream (filtered by display rules)
            const toolItem = createToolCallStreamItem(toolUse.name, toolUse.input);
            if (toolItem) {
              const snap = this.snapshotManager.getCurrentSnapshot()!;
              this.snapshotManager.updateCurrentSnapshot({
                streamItems: [...snap.streamItems, toolItem],
              });
            }

            const last = chatMessages[chatMessages.length - 1];
            if (last?.role === 'assistant') {
              if (!last.toolUses) last.toolUses = [];
              const alreadyExists = last.toolUses.some(
                (t) => t.name === toolUse.name && JSON.stringify(t.input) === JSON.stringify(toolUse.input),
              );
              if (!alreadyExists) {
                last.toolUses.push({ name: toolUse.name, input: toolUse.input });
              }
            }
            app.broadcast();
          }
        }
      } else if (message.type === 'stream_event') {
        const event = message.event;
        if (event.type === 'message_start') {
          this.snapshotManager.updateCurrentSnapshot({
            chatMessages: [...chatMessages, { role: 'assistant', content: '', toolUses: [] }],
          });
          app.broadcast();
        } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const last = chatMessages[chatMessages.length - 1];
          if (last?.role === 'assistant') {
            last.content += event.delta.text;
            this.updateAssistantStreamItem(event.delta.text);
            app.broadcast();
          }
        }
      }
    }
  }

  private updateAssistantStreamItem(textDelta: string): void {
    const snap = this.snapshotManager.getCurrentSnapshot();
    if (!snap) return;
    const items = snap.streamItems;
    const last = items[items.length - 1];
    if (last?.type === 'assistant_message') {
      this.snapshotManager.updateCurrentSnapshot({
        streamItems: [...items.slice(0, -1), { ...last, content: last.content + textDelta }],
      });
    } else {
      this.snapshotManager.updateCurrentSnapshot({
        streamItems: [...items, { type: 'assistant_message', content: textDelta }],
      });
    }
  }

  // TODO: answerPanelQuestion is silently dropped here. The Questions panel
  // textareas stay editable during editing (only Submit/Refresh are disabled),
  // so a user typing an answer while the editor is responding sees the text in
  // the field — held by QuestionItem's local useState — but the backend
  // snapshot never sees it. After editing returns to EditorReadyState,
  // hasAnswered reads from props and Submit stays grey, leaving the user
  // confused about a non-empty textarea with a disabled Submit. If the
  // QuestionItem then unmounts (e.g. anchor sort order changes), the local
  // text is lost too. Fix: handle answerPanelQuestion here the same way
  // EditorReadyState does, OR disable the textareas while editorWorking.
  handleMessage(app: App, message: SidebarOutMessage): void {
    switch (message.type) {
      case 'setDraftMessage':
        this.messageDraft = message.message;
        app.broadcast();
        return;
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
      case 'toggleQuestionsPanel':
        this.panelCollapsed = !this.panelCollapsed;
        app.broadcast();
        return;
      case 'submitSpecFeedback':
        // Ignored: the submit button is disabled while editing is in progress.
        return;
    }
  }

  interrupt(): void {
    this.interrupted = true;
    this.forkedSession?.abort();
    this.questionsSession?.abort();
  }

  isInteractive(): boolean {
    return false;
  }

  getScreen(): AppScreen {
    const snapshot = this.snapshotManager.getCurrentSnapshot();
    const editorAgent: AgentStatus = {
      working: true,
      phase: this.hasEditedSpec ? 'editing_plan' : 'responding',
    };
    const questionsPanel = {
      rounds: buildQuestionsPanelRounds(snapshot?.specContent ?? '', snapshot?.questionRounds ?? []),
      loading: false,
      toolCalls: [],
      collapsed: this.panelCollapsed,
      willRegenerate: this.backgroundRegenOnComplete,
    };

    return {
      type: 'specEditing',
      specFilePath: this.specFilePath,
      prompt: snapshot?.prompt ?? '',
      streamItems: snapshot?.streamItems ?? [],
      messageDraft: this.messageDraft,
      feedbackItems: snapshot?.pendingFeedback ?? [],
      nFeedback: snapshot?.pendingFeedback.length ?? 0,
      editorAgent,
      questionsAgent: computeQuestionsAgent(questionsPanel, editorAgent),
      sessionId: this.editingSession.getSessionId() ?? undefined,
      questionsPanel,
    };
  }
}

import type { SidebarOutMessage } from '../../types/messages';
import type { PromptQuestion } from '../../types/promptQuestion';
import type { QuestioningMessage } from '../../types/questioningMessage';
import type { AgentPhase, AppScreen } from '../../types/screens';
import { refinePrompt } from '../../utils/promptRefinement';
import { formatAnswer, hasAnswer } from '../../utils/questionUtils';
import { cleanupSpecTemplateFile, writeSpecTemplateFile } from '../../utils/specTemplate';
import { createToolCallStreamItem, extractToolUseFromContent } from '../../utils/toolUse';
import type { App, AppContext, AppState } from '../app';
import { FORK_EDITOR_FROM_QUESTIONS } from '../featureFlags';
import { getQuestionContinuePrompt, getQuestionPrompt } from '../prompts';
import { RateLimitError } from '../session';
import { ClaudeSession } from '../session';
import { QUESTIONING_SYSTEM_PROMPT } from '../systemPrompts';
import { buildStreamMessages, copyQuestioningState } from '../utils/questionStreamParsing';
import { PromptQuestionsState } from './promptQuestions';
import { WritingSpecState } from './writingSpec';

export interface QuestioningContinuation {
  session: ClaudeSession;
  messages: QuestioningMessage[];
  activeQuestions: PromptQuestion[];
  nextQuestionId: number;
  roundCount: number;
  answers: { question: string; answer: string }[];
}

export class GeneratingPromptQuestionsState implements AppState {
  private readonly ctx: AppContext;
  private currentPrompt: string;
  private readonly specTemplate: string;
  private session: ClaudeSession | null = null;
  private specTemplatePath: string | null = null;
  private messages: QuestioningMessage[] = [];
  private roundStartMessages: QuestioningMessage[] = [];
  private activeQuestions: PromptQuestion[] = [];
  private nextQuestionId = 0;
  private readonly roundCount: number;
  private interrupted = false;
  private streaming = false;
  private refining = false;
  private readonly continuation: QuestioningContinuation | null;

  constructor(ctx: AppContext, prompt: string, specTemplate: string, continuation?: QuestioningContinuation) {
    this.ctx = ctx;
    this.currentPrompt = prompt;
    this.specTemplate = specTemplate;
    this.continuation = continuation ?? null;
    this.roundCount = continuation ? continuation.roundCount + 1 : 1;

    // Mark the upcoming work as in-flight at construction time. `app.setState`
    // broadcasts before `onEnter` runs, so without this the very first render
    // would show "Ready" until the async startQuestioning / handleRefine path
    // sets the flag itself.
    if (continuation) {
      this.refining = true;

      this.session = continuation.session;
      this.messages = continuation.messages;
      // Anchor the new round's start past the end of the existing stream so the
      // first render doesn't treat roundStartIndex=0 as a new-round trigger and
      // scroll all the way to the top before the real scroll-to-new-round fires
      // later. `streamResponse` refreshes this to a `[...this.messages]` snapshot
      // once it actually starts streaming, which will be the same length here.
      this.roundStartMessages = [...continuation.messages];
      this.activeQuestions = continuation.activeQuestions;
      this.nextQuestionId = continuation.nextQuestionId;

      // Freeze questions from the previous round so they render as read-only.
      // This happens on the deep-copied messages, so the source state's questions stay editable.
      for (const m of this.messages) {
        if (m.type === 'question' && !m.frozen) m.frozen = true;
      }
    } else {
      this.streaming = true;
    }
  }

  onEnter(app: App): void {
    if (this.continuation) {
      this.handleRefine(app, this.continuation.answers);
    } else {
      this.startQuestioning(app);
    }
  }

  private async startQuestioning(app: App): Promise<void> {
    this.session = new ClaudeSession({
      claudePath: this.ctx.claudePath,
      workingDir: this.ctx.workingDir,
      name: 'Prompt questions',
    });
    this.specTemplatePath = writeSpecTemplateFile(this.specTemplate);
    await this.streamResponse(app, getQuestionPrompt(this.currentPrompt, this.specTemplatePath));
    if (!this.interrupted) {
      this.transitionToReady(app);
    }
  }

  private async handleRefine(app: App, answers: { question: string; answer: string }[]): Promise<void> {
    const finalPrompt = await this.runRefinement(app, answers);
    if (this.interrupted) return;
    this.currentPrompt = finalPrompt;

    const qaPairs = answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n');
    this.activeQuestions = [];
    this.specTemplatePath = writeSpecTemplateFile(this.specTemplate);
    await this.streamResponse(app, getQuestionContinuePrompt(qaPairs, this.specTemplatePath));
    if (!this.interrupted) {
      this.transitionToReady(app);
    }
  }

  private transitionToReady(app: App): void {
    const { messages, activeQuestions } = copyQuestioningState(this.messages, this.activeQuestions);
    app.setState(
      new PromptQuestionsState(
        this.ctx,
        this.currentPrompt,
        this.specTemplate,
        this.session!.fork('Prompt questions'),
        messages,
        activeQuestions,
        this.nextQuestionId,
        this.roundCount,
        this.roundStartMessages.length,
      ),
    );
  }

  private async streamResponse(app: App, promptText: string): Promise<void> {
    if (!this.session || this.interrupted) return;
    this.roundStartMessages = [...this.messages];
    this.streaming = true;
    app.broadcast();

    const textSegments: string[] = [''];
    const toolCalls: QuestioningMessage[] = [];

    try {
      for await (const message of this.session.prompt(promptText, {
        systemPrompt: QUESTIONING_SYSTEM_PROMPT,
        allowedTools: ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
      })) {
        if (this.interrupted) return;

        if (message.type === 'assistant' && Array.isArray(message.message?.content)) {
          const toolUse = extractToolUseFromContent(message.message.content);
          if (toolUse) {
            const item = createToolCallStreamItem(toolUse.name, toolUse.input);
            if (item) {
              toolCalls.push(item);
              // Start a new text segment after each visible tool use so
              // interleaving preserves chronological order. Hidden tool calls
              // (e.g. spec template reads) are skipped to keep alignment intact.
              textSegments.push('');
            }
            this.rebuildMessages(app, textSegments, toolCalls, false);
          }
        } else if (message.type === 'stream_event') {
          const event = message.event;
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            textSegments[textSegments.length - 1] += event.delta.text;
            this.rebuildMessages(app, textSegments, toolCalls, false);
          }
        }
      }
    } catch (error) {
      if (error instanceof RateLimitError) {
        app.onRateLimit(error.resetsAt);
        return;
      }
      console.error('Questioning failed:', error);
    }

    if (textSegments.some((s) => s)) {
      this.rebuildMessages(app, textSegments, toolCalls, true);
    }

    this.streaming = false;
    app.broadcast();
  }

  private rebuildMessages(app: App, textSegments: string[], toolCalls: QuestioningMessage[], isFinal: boolean): void {
    const result = buildStreamMessages(
      this.roundStartMessages,
      textSegments,
      toolCalls,
      isFinal,
      this.activeQuestions,
      this.nextQuestionId,
    );
    this.messages = result.messages;
    this.activeQuestions = result.activeQuestions;
    this.nextQuestionId = result.nextQuestionId;
    app.broadcast();
  }

  handleMessage(app: App, message: SidebarOutMessage): void {
    switch (message.type) {
      case 'answerPromptQuestion':
        this.handleAnswer(app, message);
        return;
      case 'generateSpec':
        this.handleGenerateSpec(app);
        return;
    }
  }

  private handleAnswer(app: App, message: Extract<SidebarOutMessage, { type: 'answerPromptQuestion' }>): void {
    const q = this.activeQuestions.find((q) => q.id === message.questionId);
    if (!q) return;
    q.textAnswer = message.textAnswer;
    q.chosenIndices = message.chosenIndices;
    app.broadcast();
  }

  private handleGenerateSpec(app: App): void {
    // Fork the questioning session for the editor agent before `setState`
    // triggers our `interrupt()`, which aborts `this.session`. The template
    // file and template-path cleanup mirror `PromptQuestionsState.handleGenerateSpec`
    // so interrupt()'s own cleanup becomes a no-op.
    const questionSession = FORK_EDITOR_FROM_QUESTIONS ? (this.session?.fork('Writing Spec') ?? null) : null;
    if (!FORK_EDITOR_FROM_QUESTIONS) {
      this.session?.abort();
    }
    cleanupSpecTemplateFile(this.specTemplatePath);
    this.specTemplatePath = null;
    const answers = this.collectAnswers();

    app.setState(new WritingSpecState(this.ctx, this.currentPrompt, this.specTemplate, questionSession, answers));
  }

  private collectAnswers(): { question: string; answer: string }[] {
    return this.activeQuestions.filter((q) => hasAnswer(q)).map((q) => ({ question: q.text, answer: formatAnswer(q) }));
  }

  private async runRefinement(app: App, answers: { question: string; answer: string }[]): Promise<string> {
    this.refining = true;
    app.broadcast();

    let finalPrompt = this.currentPrompt;
    try {
      const generator = refinePrompt(this.ctx, this.currentPrompt, answers);
      let result = await generator.next();
      while (!result.done) {
        if (this.interrupted) return finalPrompt;
        result = await generator.next();
      }
      finalPrompt = result.value;
    } catch (error) {
      if (error instanceof RateLimitError) {
        app.onRateLimit(error.resetsAt);
        return finalPrompt;
      }
      console.error('Prompt refinement failed:', error);
    }
    this.refining = false;
    return finalPrompt;
  }

  interrupt(): void {
    this.interrupted = true;
    this.session?.abort();
    cleanupSpecTemplateFile(this.specTemplatePath);
    this.specTemplatePath = null;
  }

  isInteractive(): boolean {
    return false;
  }

  getScreen(): AppScreen {
    const isWorking = this.streaming || this.refining;
    const phase: AgentPhase = this.refining ? 'updating_prompt' : this.streaming ? 'generating_questions' : 'ready';

    return {
      type: 'promptRefinement',
      questions: this.activeQuestions,
      currentPrompt: this.currentPrompt,
      questionsLoading: this.streaming,
      refining: this.refining,
      agentStatus: { working: isWorking, phase },
      questioningMessages: this.messages,
      isFirstRound: this.roundCount === 1,
      roundStartIndex: this.roundStartMessages.length,
    };
  }
}

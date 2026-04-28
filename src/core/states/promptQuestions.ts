import type { SidebarOutMessage } from '../../types/messages';
import type { PromptQuestion } from '../../types/promptQuestion';
import type { QuestioningMessage } from '../../types/questioningMessage';
import type { AppScreen } from '../../types/screens';
import { formatAnswer, hasAnswer } from '../../utils/questionUtils';
import type { App, AppContext, AppState } from '../app';
import { FORK_EDITOR_FROM_QUESTIONS } from '../featureFlags';
import type { ClaudeSession } from '../session';
import { copyQuestioningState } from '../utils/questionStreamParsing';
import { GeneratingPromptQuestionsState } from './generatingPromptQuestions';
import { WritingSpecState } from './writingSpec';

export class PromptQuestionsState implements AppState {
  private readonly ctx: AppContext;
  private readonly currentPrompt: string;
  private readonly specTemplate: string;
  private session: ClaudeSession | null;
  private messages: QuestioningMessage[];
  private activeQuestions: PromptQuestion[];
  private readonly nextQuestionId: number;
  private readonly roundCount: number;
  private readonly roundStartIndex: number;

  constructor(
    ctx: AppContext,
    currentPrompt: string,
    specTemplate: string,
    session: ClaudeSession,
    messages: QuestioningMessage[],
    activeQuestions: PromptQuestion[],
    nextQuestionId: number,
    roundCount: number,
    roundStartIndex: number,
  ) {
    this.ctx = ctx;
    this.currentPrompt = currentPrompt;
    this.specTemplate = specTemplate;
    this.session = session;
    this.messages = messages;
    this.activeQuestions = activeQuestions;
    this.nextQuestionId = nextQuestionId;
    this.roundCount = roundCount;
    this.roundStartIndex = roundStartIndex;
  }

  handleMessage(app: App, message: SidebarOutMessage): void {
    switch (message.type) {
      case 'answerPromptQuestion':
        this.handleAnswer(app, message);
        return;
      case 'refinePrompt':
        this.handleRefine(app);
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

  private handleRefine(app: App): void {
    const answers = this.collectAnswers();
    if (answers.length === 0) return;

    const { messages, activeQuestions } = copyQuestioningState(this.messages, this.activeQuestions);
    app.setState(
      new GeneratingPromptQuestionsState(this.ctx, this.currentPrompt, this.specTemplate, {
        session: this.session!.fork('Prompt questions'),
        messages,
        activeQuestions,
        nextQuestionId: this.nextQuestionId,
        roundCount: this.roundCount,
        answers,
      }),
    );
  }

  private handleGenerateSpec(app: App): void {
    const questionSession = FORK_EDITOR_FROM_QUESTIONS ? (this.session?.fork('Writing plan') ?? null) : null;
    if (!FORK_EDITOR_FROM_QUESTIONS) {
      this.session?.abort();
    }
    const answers = this.collectAnswers();

    app.setState(new WritingSpecState(this.ctx, this.currentPrompt, this.specTemplate, questionSession, answers));
  }

  private collectAnswers(): { question: string; answer: string }[] {
    return this.activeQuestions.filter((q) => hasAnswer(q)).map((q) => ({ question: q.text, answer: formatAnswer(q) }));
  }

  interrupt(): void {
    this.session?.abort();
  }

  isInteractive(): boolean {
    return true;
  }

  getScreen(): AppScreen {
    return {
      type: 'promptRefinement',
      questions: this.activeQuestions,
      currentPrompt: this.currentPrompt,
      questionsLoading: false,
      refining: false,
      agentStatus: { working: false, phase: 'ready' },
      questioningMessages: this.messages,
      isFirstRound: this.roundCount === 1,
      roundStartIndex: this.roundStartIndex,
    };
  }
}

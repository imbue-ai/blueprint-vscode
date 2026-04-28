// Shared types
import type { TemplateConfig } from './onboarding';
import type { PromptQuestion } from './promptQuestion';
import type { PromptTemplate } from './promptTemplate';
import type { QuestionBase } from './question';
import type { QuestioningMessage } from './questioningMessage';

// Structured phase so UI branching can key off a typed enum instead of string
// matching on the display label. The label is derived via `agentStatusLabel`.
export type AgentPhase =
  | 'ready'
  | 'updating_prompt'
  | 'generating_questions'
  | 'reviewing_plan'
  | 'responding'
  | 'editing_plan'
  | 'writing_plan'
  | 'waiting_for_plan'
  | 'waiting_for_plan_review'
  | 'waiting_for_plan_edit';

export interface AgentStatus {
  working: boolean;
  phase: AgentPhase;
}

export function agentStatusLabel(phase: AgentPhase): string {
  switch (phase) {
    case 'ready':
      return 'Ready';
    case 'updating_prompt':
      return 'Updating prompt';
    case 'generating_questions':
      return 'Generating questions';
    case 'reviewing_plan':
      return 'Reviewing plan';
    case 'responding':
      return 'Responding';
    case 'editing_plan':
      return 'Editing plan';
    case 'writing_plan':
      return 'Writing plan';
    case 'waiting_for_plan':
      return 'Waiting for plan to be written';
    case 'waiting_for_plan_review':
      return 'Waiting for agent to review plan';
    case 'waiting_for_plan_edit':
      return 'Waiting for plan edit to complete';
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolUses?: { name: string; input: Record<string, unknown> }[];
}

export type StreamItem =
  | { type: 'tool_call'; name: string; summary: string; args: Record<string, unknown>; result?: string }
  | { type: 'user_message'; content: string }
  | { type: 'assistant_message'; content: string };

export interface SpecQuestion extends QuestionBase {
  anchor: string;
  line?: number;
}

export interface FeedbackItem {
  id: string;
  text: string;
  startLine: number;
  endLine: number;
}

export interface QuestionRound {
  questions: SpecQuestion[];
  frozen: boolean;
}

export interface SpecQuestionsPanelState {
  rounds: QuestionRound[];
  loading: boolean;
  toolCalls: Array<Extract<StreamItem, { type: 'tool_call' }>>;
  collapsed: boolean;
  willRegenerate: boolean;
}

// Screens
interface OnboardingScreen {
  type: 'onboarding';
  data: TemplateConfig;
  selectedModel: string;
}

interface PromptScreen {
  type: 'prompt';
  prompt: string;
}

interface PromptRefinementScreen {
  type: 'promptRefinement';
  questions: PromptQuestion[];
  currentPrompt: string;
  questionsLoading: boolean;
  refining: boolean;
  agentStatus: AgentStatus;
  questioningMessages: QuestioningMessage[];
  isFirstRound: boolean;
  roundStartIndex: number;
}

interface SpecEditingScreen {
  type: 'specEditing';
  specFilePath: string;
  prompt: string;
  streamItems: StreamItem[];
  messageDraft: string;
  feedbackItems: FeedbackItem[];
  nFeedback: number;
  // Two independent agents track separate work. The editor drives spec
  // writing/editing; the questions agent generates clarifying questions
  // in the background. UI tabs render each directly — no derivation.
  editorAgent: AgentStatus;
  questionsAgent: AgentStatus;
  questionsPanel?: SpecQuestionsPanelState;
  sessionId?: string;
  // True only on the first broadcast after entering this screen from another
  // screen type. The host injects this in App.getData; states don't set it.
  // Used by the webview to land on the chat tab on fresh entry while preserving
  // tab persistence on view detours (settings, template editor).
  freshEntry?: boolean;
}

interface SettingsScreen {
  type: 'settings';
  selectedModel: string;
  templates: PromptTemplate[];
  selectedTemplateId: string;
}

export type TemplateEditorMode = 'structured' | 'freeform';

interface TemplateEditorScreen {
  type: 'templateEditor';
  name: string;
  filename: string;
  mode: TemplateEditorMode;
  data: TemplateConfig;
  rawPrompt: string;
  isCreate: boolean;
}

export type AppScreen =
  | OnboardingScreen
  | PromptScreen
  | PromptRefinementScreen
  | SpecEditingScreen
  | SettingsScreen
  | TemplateEditorScreen;

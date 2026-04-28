import type { PromptQuestion } from './promptQuestion';

interface ToolCallMessage {
  type: 'tool_call';
  name: string;
  summary: string;
  args: Record<string, unknown>;
}

interface TextMessage {
  type: 'text';
  content: string;
}

interface QuestionMessage {
  type: 'question';
  question: PromptQuestion;
  frozen: boolean;
}

export type QuestioningMessage = ToolCallMessage | TextMessage | QuestionMessage;

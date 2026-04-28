import ReactMarkdown from 'react-markdown';

import type { QuestioningMessage } from '../../types/questioningMessage';
import { postMessage } from '../useVSCodeMessaging';
import { QuestionItem } from './QuestionItem';

type ToolCallMessage = Extract<QuestioningMessage, { type: 'tool_call' }>;
type NonToolMessage = Exclude<QuestioningMessage, { type: 'tool_call' }>;

type QuestioningGroup =
  | { type: 'tool_calls'; items: ToolCallMessage[] }
  | { type: 'message'; message: NonToolMessage; isFirstQuestion: boolean; isLastFrozenQuestion: boolean };

export function hasActiveQuestions(messages: QuestioningMessage[]): boolean {
  return messages.some((m) => m.type === 'question' && !m.frozen);
}

export function groupQuestioningMessages(messages: QuestioningMessage[]): QuestioningGroup[] {
  const groups: QuestioningGroup[] = [];
  let seenActiveQuestion = false;

  // Find the index of the last frozen question
  let lastFrozenIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].type === 'question' && (messages[i] as { frozen: boolean }).frozen) {
      lastFrozenIdx = i;
      break;
    }
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.type === 'tool_call') {
      const last = groups[groups.length - 1];
      if (last?.type === 'tool_calls') {
        last.items.push(msg);
      } else {
        groups.push({ type: 'tool_calls', items: [msg] });
      }
    } else {
      const isFirst = msg.type === 'question' && !msg.frozen && !seenActiveQuestion;
      const isLastFrozen = i === lastFrozenIdx && !seenActiveQuestion;
      if (msg.type === 'question' && !msg.frozen) seenActiveQuestion = true;
      groups.push({ type: 'message', message: msg, isFirstQuestion: isFirst, isLastFrozenQuestion: isLastFrozen });
    }
  }
  return groups;
}

export function QuestioningMessageItem({
  message,
  isFirstQuestion,
  isLastFrozenQuestion,
}: {
  message: NonToolMessage;
  isFirstQuestion?: boolean;
  isLastFrozenQuestion?: boolean;
}) {
  switch (message.type) {
    case 'text':
      return <ReactMarkdown>{message.content}</ReactMarkdown>;
    case 'question': {
      const q = message.question;
      const sendUpdate = (textAnswer: string, chosenIndices: number[]) => {
        postMessage({ type: 'answerPromptQuestion', questionId: q.id, textAnswer, chosenIndices });
      };
      return (
        <div
          style={
            isFirstQuestion && !message.frozen
              ? { borderTop: '1px solid var(--vscode-widget-border)', paddingTop: 12, marginTop: 8 }
              : undefined
          }
        >
          <QuestionItem question={q} frozen={message.frozen} showBorder={false} onAnswerChange={sendUpdate} />
          {isLastFrozenQuestion && (
            <hr
              style={{
                border: 'none',
                borderTop: '1px solid var(--vscode-widget-border)',
                marginTop: 12,
                marginBottom: 0,
              }}
            />
          )}
        </div>
      );
    }
  }
}

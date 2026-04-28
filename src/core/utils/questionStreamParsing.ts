import type { PromptQuestion } from '../../types/promptQuestion';
import type { QuestioningMessage } from '../../types/questioningMessage';
import { parseQuestionXml } from '../xmlQuestionParser';

/**
 * Deep copy messages and activeQuestions, maintaining referential identity between
 * question objects that appear in both arrays. Text/tool_call messages are shared
 * (they're immutable); question messages and their PromptQuestion objects are copied.
 */
export function copyQuestioningState(
  messages: QuestioningMessage[],
  activeQuestions: PromptQuestion[],
): { messages: QuestioningMessage[]; activeQuestions: PromptQuestion[] } {
  const questionMap = new Map<PromptQuestion, PromptQuestion>();

  const copyQuestion = (q: PromptQuestion): PromptQuestion => {
    let copy = questionMap.get(q);
    if (!copy) {
      copy = { ...q, chosenIndices: [...q.chosenIndices] };
      questionMap.set(q, copy);
    }
    return copy;
  };

  const newActiveQuestions = activeQuestions.map(copyQuestion);

  const newMessages = messages.map((m): QuestioningMessage => {
    if (m.type === 'question') {
      return { ...m, question: copyQuestion(m.question) };
    }
    return m;
  });

  return { messages: newMessages, activeQuestions: newActiveQuestions };
}

/**
 * Build the full message list from interleaved text segments and tool calls.
 * Returns the new messages, active questions, and updated question ID counter.
 */
export function buildStreamMessages(
  roundStartMessages: QuestioningMessage[],
  textSegments: string[],
  toolCalls: QuestioningMessage[],
  isFinal: boolean,
  existingActiveQuestions: PromptQuestion[],
  nextQuestionId: number,
): { messages: QuestioningMessage[]; activeQuestions: PromptQuestion[]; nextQuestionId: number } {
  const messages: QuestioningMessage[] = [...roundStartMessages];
  const activeQuestions: PromptQuestion[] = [];
  let currentId = nextQuestionId;

  // Interleave text segments with tool calls chronologically:
  // text[0] → toolCall[0] → text[1] → toolCall[1] → ...
  for (let i = 0; i < textSegments.length; i++) {
    const isLast = i === textSegments.length - 1;
    if (textSegments[i]) {
      // Non-last segments precede a tool call and are complete — pass false so
      // plain-text remainder is displayed instead of being suppressed.
      currentId = addParsedSegments(
        messages,
        activeQuestions,
        textSegments[i],
        isLast ? isFinal : false,
        existingActiveQuestions,
        currentId,
      );
    }
    if (i < toolCalls.length) {
      messages.push(toolCalls[i]);
    }
  }

  return { messages, activeQuestions, nextQuestionId: currentId };
}

function addParsedSegments(
  messages: QuestioningMessage[],
  activeQuestions: PromptQuestion[],
  text: string,
  isFinal: boolean,
  existingActiveQuestions: PromptQuestion[],
  nextQuestionId: number,
): number {
  const { segments, remainder } = parseQuestionXml(text);
  let currentId = nextQuestionId;

  for (const seg of segments) {
    if (seg.type === 'text') {
      messages.push({ type: 'text', content: seg.content });
    } else {
      const existing = existingActiveQuestions.find((q) => q.text === seg.question.text);
      const id = existing ? existing.id : currentId++;
      const question: PromptQuestion = { ...seg.question, id };
      if (existing) {
        question.textAnswer = existing.textAnswer;
        question.chosenIndices = existing.chosenIndices;
      }
      activeQuestions.push(question);
      messages.push({ type: 'question', question, frozen: false });
    }
  }

  if (remainder && !isFinal && !remainder.trimStart().startsWith('<question>')) {
    const trimmed = remainder.replace(/^\n+/, '').replace(/\n+$/, '');
    if (trimmed) {
      messages.push({ type: 'text', content: trimmed });
    }
  }

  return currentId;
}

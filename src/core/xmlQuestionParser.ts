import type { PromptQuestion } from '../types/promptQuestion';
import { validatePromptQuestion } from '../utils/promptQuestionUtils';

type Segment = { type: 'text'; content: string } | { type: 'question'; question: PromptQuestion };

interface ParseResult {
  segments: Segment[];
  remainder: string;
}

function trimEmpty(s: string): string {
  // Strip leading/trailing blank lines but preserve internal newlines
  return s.replace(/^\n+/, '').replace(/\n+$/, '');
}

export function parseQuestionXml(text: string): ParseResult {
  const segments: Segment[] = [];
  let pos = 0;

  while (pos < text.length) {
    const openIdx = text.indexOf('<question>', pos);
    if (openIdx === -1) break;

    const closeIdx = text.indexOf('</question>', openIdx);
    if (closeIdx === -1) {
      const textBefore = trimEmpty(text.slice(pos, openIdx));
      if (textBefore) {
        segments.push({ type: 'text', content: textBefore });
      }
      return { segments, remainder: text.slice(openIdx) };
    }

    const textBefore = trimEmpty(text.slice(pos, openIdx));
    if (textBefore) {
      segments.push({ type: 'text', content: textBefore });
    }

    const jsonStr = text.slice(openIdx + '<question>'.length, closeIdx);
    try {
      const parsed = JSON.parse(jsonStr);
      const question = validatePromptQuestion(parsed);
      if (question) {
        segments.push({ type: 'question', question });
      }
    } catch {
      segments.push({ type: 'text', content: jsonStr.trim() });
    }

    pos = closeIdx + '</question>'.length;
  }

  if (pos === 0) {
    return { segments: [], remainder: text };
  }

  const trailing = trimEmpty(text.slice(pos));
  if (trailing) {
    segments.push({ type: 'text', content: trailing });
  }

  return { segments, remainder: '' };
}

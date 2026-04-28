import type { QuestionBase } from '../types/question';

export function formatQAPairs(questions: QuestionBase[]): string {
  return questions
    .filter((q) => hasAnswer(q))
    .map((q) => `Q: ${q.text}\n\nA: ${formatAnswer(q)}`)
    .join('\n\n');
}

export function formatAnswer(q: QuestionBase): string {
  const parts: string[] = [];
  if (q.choices && q.chosenIndices.length > 0) {
    const chosenTexts = q.chosenIndices.map((i) => q.choices![i]).filter(Boolean);
    parts.push(chosenTexts.join(', '));
  }
  if (q.textAnswer.trim()) {
    parts.push(q.textAnswer.trim());
  }
  return parts.join('. ');
}

export function hasAnswer(q: QuestionBase): boolean {
  return q.chosenIndices.length > 0 || q.textAnswer.trim().length > 0;
}
